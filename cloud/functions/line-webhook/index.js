import crypto from 'crypto';
import OpenAI from 'openai';

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error('stage: ai init error - OPENAI_API_KEY missing');
}
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const channelSecret = process.env.LINE_CHANNEL_SECRET;

function verifyLineSignature(req) {
  const sig =
    (typeof req.get === 'function'
      ? req.get('x-line-signature')
      : req.headers?.['x-line-signature']) || '';
  const raw = req.rawBody
    ? req.rawBody
    : Buffer.from(JSON.stringify(req.body || {}));
  const calc = crypto
    .createHmac('sha256', channelSecret || '')
    .update(raw)
    .digest('base64');
  return sig === calc;
}

async function replyLine(replyToken, text) {
  if (!channelAccessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');

  const resp = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      replyToken,
      messages: [{ type: 'text', text }],
    }),
  });
  return resp.status;
}

async function pushLine(to, text) {
  if (!channelAccessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');

  const resp = await fetch('https://api.line.me/v2/bot/message/push', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${channelAccessToken}`,
    },
    body: JSON.stringify({
      to,
      messages: [{ type: 'text', text }],
    }),
  });
  return resp.status;
}

async function downloadImageAsBase64(messageId) {
  if (!channelAccessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');

  const r = await fetch(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      headers: {
        Authorization: `Bearer ${channelAccessToken}`,
      },
    },
  );
  if (!r.ok) throw new Error(`LINE content ${r.status}`);
  const buf = Buffer.from(await r.arrayBuffer());
  console.log('stage: image downloaded');
  const base64 = buf.toString('base64');
  console.log('stage: image to base64 length=', base64?.length || 0);
  return base64;
}

async function summarizeMealFromBase64(imageBase64) {
  console.log('stage: ai start');
  if (!openai) throw new Error('OPENAI client not initialized');

  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 60_000);

  try {
    const dataUrl = `data:image/jpeg;base64,${imageBase64}`;
    const resp = await openai.chat.completions.create(
      {
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: 'この料理写真を短く要約し、主要な具材を3つ抽出し、日本語で返答。JSONで {summary:string, ingredients:string[]} を返して。',
              },
              { type: 'image_url', image_url: { url: dataUrl } },
            ],
          },
        ],
      },
      { signal: controller.signal },
    );

    const raw = resp?.choices?.[0]?.message?.content || '';
    console.log('AI raw output=', String(raw).slice(0, 200));

    const jsonMatch = String(raw).match(/\{[\s\S]*\}/);
    if (!jsonMatch) throw new Error('no JSON in response');
    let obj;
    try {
      obj = JSON.parse(jsonMatch[0]);
    } catch (e) {
      console.log('parse error =', e?.message);
      throw e;
    }

    if (!obj.summary || !Array.isArray(obj.ingredients)) {
      throw new Error('invalid JSON shape');
    }
    console.log('stage: ai done');
    return obj;
  } catch (err) {
    console.error('stage: ai error =', err?.message || err);
    throw err;
  } finally {
    clearTimeout(t);
  }
}

export const app = async (req, res) => {
  if (req.method === 'GET') return res.status(200).send('alive');
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  if (!verifyLineSignature(req)) return res.status(403).send('invalid signature');

  let body = req.body || {};
  if (typeof body === 'string') {
    try {
      body = JSON.parse(body || '{}');
    } catch (error) {
      console.error('failed to parse request body', error);
      body = {};
    }
  }

  const ev = body?.events?.[0];
  if (!ev) return res.status(200).send('ok');

  try {
    if (ev.message?.type === 'image') {
      if (ev.replyToken) {
        const replyStatus = await replyLine(
          ev.replyToken,
          '画像を受け取りました🔎 解析中です…',
        );
        console.log('reply status=', replyStatus);
      }

      console.log('stage: image event received');
      const imageBase64 = await downloadImageAsBase64(ev.message.id);

      if (!openai) {
        console.error('stage: ai skipped - no OPENAI key');
        if (ev.source?.userId) {
          const pushStatus = await pushLine(
            ev.source.userId,
            '解析に失敗しました🙏もう一度お試しください',
          );
          console.log('push status=', pushStatus);
        }
        console.log('stage: handler end');
        return res.status(200).send('ok');
      }

      console.log('stage: summarizeMeal called');
      let result;
      try {
        result = await summarizeMealFromBase64(imageBase64);
        const msg = `🍽️ AI解析結果\n要約: ${result.summary}\n主な具材: ${result.ingredients.slice(0, 3).join('・')}`;
        if (ev.source?.userId) {
          const pushStatus = await pushLine(ev.source.userId, msg);
          console.log('push status=', pushStatus);
        }
      } catch (e) {
        console.log('stage: ai fallback');
        if (ev.source?.userId) {
          const pushStatus = await pushLine(
            ev.source.userId,
            '解析に失敗しました🙏もう一度お試しください',
          );
          console.log('push status=', pushStatus);
        }
      } finally {
        console.log('stage: handler end');
      }

      return res.status(200).send('ok');
    }

    if (ev.message?.type === 'text' && ev.replyToken) {
      const replyStatus = await replyLine(
        ev.replyToken,
        '画像を送るとAIが要約します📷🍽',
      );
      console.log('reply status=', replyStatus);
      return res.status(200).send('ok');
    }

    return res.status(200).send('ok');
  } catch (e) {
    console.error('post-handler error', e);
    try {
      if (ev?.source?.userId) {
        const pushStatus = await pushLine(
          ev.source.userId,
          '処理でエラーが起きました🙏 もう一度お試しください',
        );
        console.log('push status=', pushStatus);
      }
    } catch (ee) {
      console.error('fallback push error', ee);
    }
    return res.status(200).send('ok');
  }
};
