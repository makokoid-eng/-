import crypto from 'crypto';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

function verifyLineSignature(req) {
  const sig = req.get('x-line-signature') || '';
  const raw = req.rawBody ? req.rawBody : Buffer.from(JSON.stringify(req.body || {}));
  const calc = crypto
    .createHmac('sha256', process.env.LINE_CHANNEL_SECRET || '')
    .update(raw)
    .digest('base64');
  return sig === calc;
}

async function replyLine(replyToken, text) {
  try {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');
    const resp = await fetch('https://api.line.me/v2/bot/message/reply', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ replyToken, messages: [{ type: 'text', text }] }),
    });
    const body = await resp.text();
    console.log('reply status=', resp.status, 'body=', body?.slice(0, 200));
    return resp.ok;
  } catch (error) {
    console.error('replyLine error', error);
    throw error;
  }
}

async function pushLine(to, text) {
  try {
    const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
    if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');
    const resp = await fetch('https://api.line.me/v2/bot/message/push', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ to, messages: [{ type: 'text', text }] }),
    });
    console.log('push status=', resp.status);
    return resp.ok;
  } catch (error) {
    console.error('pushLine error', error);
    throw error;
  }
}

async function downloadImageAsDataUrl(messageId) {
  const token = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!token) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');
  const r = await fetch(`https://api-data.line.me/v2/bot/message/${messageId}/content`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!r.ok) {
    throw new Error(`LINE content ${r.status}`);
  }
  const buf = Buffer.from(await r.arrayBuffer());
  const dataUrl = `data:image/jpeg;base64,${buf.toString('base64')}`;
  console.log('image_data_url_length=', dataUrl.length);
  return dataUrl;
}

async function summarizeMeal(dataUrl) {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY is not set');
  }
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45_000);
  try {
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
      signal: controller.signal,
    });
    const raw = ai.choices?.[0]?.message?.content ?? '';
    const s = raw.indexOf('{'),
      e = raw.lastIndexOf('}');
    let parsed = null;
    if (s >= 0 && e > s) {
      try {
        parsed = JSON.parse(raw.slice(s, e + 1));
      } catch (error) {
        console.error('summarizeMeal JSON parse error', error);
      }
    }
    const foods = Array.isArray(parsed?.food_items) ? parsed.food_items.join(', ') : '不明';
    const est = parsed?.estimates || {};
    const kcal = est.calorie_kcal ?? '—';
    const p = est.protein_g ?? '—';
    const f = est.fat_g ?? '—';
    const c = est.carb_g ?? '—';
    const advice = parsed?.advice || '—';
    return `解析結果🍽\n- 想定: ${foods}\n- 推定: ${kcal} kcal / P:${p}g F:${f}g C:${c}g\n- コメント: ${advice}`;
  } finally {
    clearTimeout(timeout);
  }
}

export const app = async (req, res) => {
  if (req.method === 'GET') return res.status(200).send('alive');
  if (req.method !== 'POST') return res.status(405).send('Method Not Allowed');

  if (!verifyLineSignature(req)) return res.status(403).send('invalid signature');

  const ev = req.body?.events?.[0];
  if (!ev) return res.status(200).send('ok');

  try {
    if (ev.message?.type === 'image') {
      if (ev.replyToken) await replyLine(ev.replyToken, '画像を受け取りました🔎 解析中です…');

      const dataUrl = await downloadImageAsDataUrl(ev.message.id);
      const text = await summarizeMeal(dataUrl);
      if (ev.source?.userId) await pushLine(ev.source.userId, text);

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
      if (ev?.source?.userId)
        await pushLine(ev.source.userId, '処理でエラーが起きました🙏 もう一度お試しください');
    } catch (ee) {
      console.error('fallback push error', ee);
    }
    return res.status(200).send('ok');
  }
};
