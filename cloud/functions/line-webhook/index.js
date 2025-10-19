import crypto from 'crypto';
import OpenAI from 'openai';

const openaiApiKey = process.env.OPENAI_API_KEY;
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

function verifyLineSignature(req) {
  const sig =
    (typeof req.get === 'function'
      ? req.get('x-line-signature')
      : req.headers?.['x-line-signature']) || '';
  const raw = req.rawBody
    ? req.rawBody
    : Buffer.from(JSON.stringify(req.body || {}));
  const calc = crypto
    .createHmac('sha256', process.env.LINE_CHANNEL_SECRET || '')
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
  console.log('reply status=', resp.status);
  return resp.ok;
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
  console.log('push status=', resp.status);
  return resp.ok;
}

async function downloadImageAsDataUrl(messageId) {
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
  const dataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
  console.log('image_data_url_length=', dataUrl.length);
  return dataUrl;
}

async function summarizeMeal(dataUrl) {
  if (!openai) throw new Error('OPENAI_API_KEY is not set');

  const sys =
    '食事画像を栄養視点で要約。短い日本語コメントとJSON(food_items[], estimates{calorie_kcal,protein_g,fat_g,carb_g}, quality(0-5), advice)。JSONはコードブロックなし。';
  const ai = await openai.chat.completions.create({
    model: 'gpt-4o-mini',
    messages: [
      { role: 'system', content: sys },
      {
        role: 'user',
        content: [
          { type: 'text', text: 'この食事を推定して。' },
          { type: 'input_image', image_url: dataUrl },
        ],
      },
    ],
  });
  const raw = ai.choices?.[0]?.message?.content ?? '';
  console.log('AI raw output=', raw?.slice(0, 200));
  const s = raw.indexOf('{');
  const e = raw.lastIndexOf('}');
  let parsed = null;
  if (s >= 0 && e > s) {
    try {
      parsed = JSON.parse(raw.slice(s, e + 1));
    } catch {}
  }
  const foods = Array.isArray(parsed?.food_items)
    ? parsed.food_items.join(', ')
    : '不明';
  const est = parsed?.estimates || {};
  const kcal = est.calorie_kcal ?? '—';
  const p = est.protein_g ?? '—';
  const f = est.fat_g ?? '—';
  const c = est.carb_g ?? '—';
  const advice = parsed?.advice || '—';
  return `解析結果🍽\n- 想定: ${foods}\n- 推定: ${kcal} kcal / P:${p}g F:${f}g C:${c}g\n- コメント: ${advice}`;
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
      if (ev.replyToken)
        await replyLine(ev.replyToken, '画像を受け取りました🔎 解析中です…');

      console.log('stage: image event received');
      const dataUrl = await downloadImageAsDataUrl(ev.message.id);
      console.log('stage: image downloaded');

      console.log('stage: ai start');
      let resultText = null;
      try {
        resultText = await summarizeMeal(dataUrl);
        console.log('stage: ai done');
      } catch (e) {
        console.error('stage: ai error', e);
      }

      const text = resultText || '解析に失敗しました🙏 もう一度お試しください';
      if (ev.source?.userId) {
        const ok = await pushLine(ev.source.userId, text);
        console.log('push status=', ok);
      }

      return res.status(200).send('ok');
    }

    if (ev.message?.type === 'text' && ev.replyToken) {
      await replyLine(ev.replyToken, '画像を送るとAIが要約します📷🍽');
      return res.status(200).send('ok');
    }

    return res.status(200).send('ok');
  } catch (e) {
    console.error('post-handler error', e);
    try {
      if (ev?.source?.userId) {
        const ok = await pushLine(
          ev.source.userId,
          '処理でエラーが起きました🙏 もう一度お試しください',
        );
        console.log('push status=', ok);
      }
    } catch (ee) {
      console.error('fallback push error', ee);
    }
    return res.status(200).send('ok');
  }
};
