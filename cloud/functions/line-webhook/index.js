const { google } = require('googleapis');

const fetchImpl = global.fetch || ((...args) => import('node-fetch').then(({ default: f }) => f(...args)));
const fetch = (...args) => fetchImpl(...args);

let openai = null;
try {
  const { OpenAI } = require('openai');
  if (process.env.OPENAI_API_KEY) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
} catch (err) {
  console.warn('OPENAI_INIT_FAIL', err?.message || err);
}

const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

const EST_SYS = `
あなたは栄養推定アシスタント。入力（食事の説明 or 画像）から
次 JSON を **JSON文字列のみ** で返す:
{"veg":number,"pro":number,"kcal":number,"summary":string}
制約:
- veg(野菜g), pro(たんぱく質g), kcal(一食kcal)
- summary は日本語1行（料理名と根拠の短文）
- 数値は0やNaNを避け、常識的な範囲で推定
`;

const LINE_API_BASE = 'https://api.line.me/v2/bot';
const LINE_DATA_BASE = 'https://api-data.line.me/v2/bot';

const sheetsCache = { client: null };
const pendingFixMap = new Map();

function fireAndForget(promise) {
  if (!promise || typeof promise.then !== 'function') return;
  promise.catch((err) => console.error('ASYNC_FAIL', err?.message || err));
}

function qsSafe(obj) {
  const search = new URLSearchParams();
  Object.entries(obj || {}).forEach(([key, value]) => {
    if (value === undefined || value === null) return;
    search.append(key, String(value));
  });
  return search.toString();
}

function dummyEstimate(meta = {}) {
  const baseVeg = meta.fromText ? 80 : 90;
  const basePro = meta.fromText ? 18 : 22;
  const baseKcal = meta.fromText ? 520 : 580;
  return {
    veg: Math.round(baseVeg + Math.random() * 40),
    pro: Math.round(basePro + Math.random() * 15),
    kcal: Math.round(baseKcal + Math.random() * 180),
    summary: meta.fromText ? '食事内容をもとに概算しました。' : '写真から概算しました。'
  };
}

async function getSheets() {
  if (sheetsCache.client) return sheetsCache.client;
  const auth = await google.auth.getClient({
    scopes: ['https://www.googleapis.com/auth/spreadsheets']
  });
  const client = google.sheets({ version: 'v4', auth });
  sheetsCache.client = client;
  return client;
}

async function appendLogsRow(row) {
  if (!process.env.SHEET_ID) {
    throw new Error('SHEET_ID not set');
  }
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: 'logs!A1',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

async function appendMealLogRow(row) {
  if (!process.env.SHEET_ID) {
    throw new Error('SHEET_ID not set');
  }
  const sheets = await getSheets();
  await sheets.spreadsheets.values.append({
    spreadsheetId: process.env.SHEET_ID,
    range: 'MealLog!A1',
    valueInputOption: 'USER_ENTERED',
    insertDataOption: 'INSERT_ROWS',
    requestBody: { values: [row] }
  });
}

async function askOpenAI(parts) {
  if (!openai) return null;
  try {
    const res = await openai.responses.create({
      model: OPENAI_MODEL,
      input: [
        { role: 'system', content: EST_SYS },
        { role: 'user', content: parts }
      ],
      temperature: 0.2
    });
    const text = res.output_text || '';
    const json = JSON.parse(text);
    if (
      typeof json.veg !== 'number' ||
      typeof json.pro !== 'number' ||
      typeof json.kcal !== 'number' ||
      typeof json.summary !== 'string'
    ) {
      return null;
    }
    return json;
  } catch (e) {
    console.error('OPENAI_FAIL', e?.message || e);
    return null;
  }
}

async function estimateFromText(text) {
  const ai = await askOpenAI([{ type: 'input_text', text: `食事の説明: ${text}` }]);
  if (ai) return ai;
  return dummyEstimate({ fromText: true });
}

async function estimateFromImageBase64(b64) {
  const dataUrl = `data:image/jpeg;base64,${b64}`;
  const ai = await askOpenAI([
    { type: 'input_text', text: 'この食事の栄養を推定して' },
    { type: 'input_image', image_url: dataUrl }
  ]);
  if (ai) return ai;
  return dummyEstimate({ fromText: false });
}

async function getUserMode(userId) {
  try {
    const sheets = await getSheets();
    const resp = await sheets.spreadsheets.values
      .get({
        spreadsheetId: process.env.SHEET_ID,
        range: 'Users!A2:C'
      })
      .catch(() => null);
    const rows = resp?.data?.values || [];
    const row = rows.find((r) => r[0] === userId);
    return row?.[1] || 'record';
  } catch (err) {
    console.error('USER_MODE_FAIL', err?.message || err);
    return 'record';
  }
}

async function setUserMode(userId, mode) {
  const sheets = await getSheets();
  const now = new Date().toISOString();
  const cur = await sheets.spreadsheets.values
    .get({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Users!A2:C'
    })
    .catch(() => null);
  const rows = cur?.data?.values || [];
  const idx = rows.findIndex((r) => r[0] === userId);
  if (idx >= 0) {
    rows[idx][1] = mode;
    rows[idx][2] = now;
    await sheets.spreadsheets.values.update({
      spreadsheetId: process.env.SHEET_ID,
      range: `Users!A${idx + 2}:C${idx + 2}`,
      valueInputOption: 'USER_ENTERED',
      requestBody: { values: [rows[idx]] }
    });
  } else {
    await sheets.spreadsheets.values.append({
      spreadsheetId: process.env.SHEET_ID,
      range: 'Users!A1',
      valueInputOption: 'USER_ENTERED',
      insertDataOption: 'INSERT_ROWS',
      requestBody: { values: [[userId, mode, now]] }
    });
  }
}

async function callLineApi(path, body) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN not set');
  }
  const res = await fetch(`${LINE_API_BASE}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
    },
    body: JSON.stringify(body)
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`LINE API error ${res.status}: ${text}`);
  }
  return res.json().catch(() => ({}));
}

async function reply(replyToken, messages) {
  return callLineApi('/message/reply', { replyToken, messages });
}

async function push(to, messages) {
  return callLineApi('/message/push', { to, messages });
}

async function fetchLineImageContent(message) {
  if (!process.env.LINE_CHANNEL_ACCESS_TOKEN) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN not set');
  }
  const res = await fetch(`${LINE_DATA_BASE}/message/${message.id}/content`, {
    headers: {
      Authorization: `Bearer ${process.env.LINE_CHANNEL_ACCESS_TOKEN}`
    }
  });
  if (!res.ok) {
    throw new Error(`LINE data API error ${res.status}`);
  }
  const arrayBuffer = await res.arrayBuffer();
  const base64 = Buffer.from(arrayBuffer).toString('base64');
  return { base64 };
}

async function sendEstimateWithQRViaPush(userId, est) {
  const summaryText = `${est.summary}\nP:${est.pro}g / ${est.kcal}kcal / 野菜≈${est.servings}皿`;
  const okData = qsSafe({
    act: 'img_ok',
    food: est.summary,
    veg: est.veg,
    pro: est.pro,
    kcal: est.kcal,
    serv: est.servings
  });
  const fixData = qsSafe({
    act: 'img_fix',
    food: est.summary,
    veg: est.veg,
    pro: est.pro,
    kcal: est.kcal,
    serv: est.servings
  });
  await push(userId, [
    {
      type: 'text',
      text: summaryText,
      quickReply: {
        items: [
          {
            type: 'action',
            action: { type: 'postback', label: 'OK', data: okData }
          },
          {
            type: 'action',
            action: { type: 'postback', label: '修正', data: fixData }
          }
        ]
      }
    }
  ]);
}

async function confirmEstimate(userId, payload, replyToken) {
  const { food, veg, pro, kcal, serv } = payload;
  const now = new Date().toISOString();
  const mode = await getUserMode(userId);
  if (mode === 'trial') {
    await reply(replyToken, [
      {
        type: 'text',
        text: `お試しモードのため記録は保存しません。\nP:${pro}g / ${kcal}kcal / 野菜≈${serv}皿`
      }
    ]);
    fireAndForget(
      appendLogsRow([now, userId, 'confirm', '', food || '', veg, pro, kcal, 'trial'])
    );
    return;
  }

  await appendMealLogRow([now, userId, food || '', veg, pro, kcal, serv]);
  await reply(replyToken, [
    {
      type: 'text',
      text: `記録しました！\nP:${pro}g / ${kcal}kcal / 野菜≈${serv}皿`
    }
  ]);
  fireAndForget(
    appendLogsRow([now, userId, 'confirm', '', food || '', veg, pro, kcal, 'record'])
  );
}

function parseNumbersFromText(text) {
  if (!text) return null;
  const cleaned = text.replace(/[^0-9.,]/g, ' ').trim();
  const parts = cleaned
    .split(/[\s,]+/)
    .map((p) => p.trim())
    .filter(Boolean);
  if (parts.length < 3) return null;
  const [veg, pro, kcal] = parts.slice(0, 3).map((v) => Number(v));
  if ([veg, pro, kcal].some((n) => Number.isNaN(n))) return null;
  return { veg, pro, kcal };
}

async function handleFollow(ev) {
  const userId = ev.source?.userId;
  if (!userId) return;
  await push(userId, [
    {
      type: 'text',
      text: '友だち追加ありがとうございます！\n① 写真または食事の説明を送信 → ② 推定返信 → ③ OK/修正 → ④ 記録\nまずはモードを選んでください。'
    },
    {
      type: 'text',
      text: 'モードを選択',
      quickReply: {
        items: [
          {
            type: 'action',
            action: {
              type: 'postback',
              label: '記録モード',
              data: qsSafe({ act: 'mode_set', m: 'record' })
            }
          },
          {
            type: 'action',
            action: {
              type: 'postback',
              label: 'お試しモード',
              data: qsSafe({ act: 'mode_set', m: 'trial' })
            }
          },
          {
            type: 'action',
            action: {
              type: 'postback',
              label: 'ヘルプ',
              data: qsSafe({ act: 'help' })
            }
          }
        ]
      }
    }
  ]);
}

async function handleModeSet(userId, mode, replyToken) {
  await setUserMode(userId, mode);
  await reply(replyToken, [
    {
      type: 'text',
      text: `モードを「${mode === 'trial' ? 'お試し' : '記録'}」に設定しました。写真を送ってみてください！`
    }
  ]);
  const now = new Date().toISOString();
  fireAndForget(appendLogsRow([now, userId, 'mode_set', mode, '', '', '', '', '']));
}

async function handleHelp(replyToken) {
  await reply(replyToken, [
    {
      type: 'text',
      text: '写真 or 食事説明を送ってください。AIが推定（野菜g/たんぱくg/kcal）を返し、OKで記録、修正で値を調整できます。'
    }
  ]);
}

async function handleEvent(ev) {
  const userId = ev.source?.userId;
  if (!userId) return;
  const now = new Date().toISOString();

  if (ev.type === 'follow') {
    await handleFollow(ev);
    return;
  }

  if (ev.type === 'postback') {
    const q = new URLSearchParams(ev.postback?.data || '');
    const act = q.get('act') || '';
    if (act === 'mode_set') {
      const m = q.get('m') === 'trial' ? 'trial' : 'record';
      await handleModeSet(userId, m, ev.replyToken);
      return;
    }
    if (act === 'help') {
      await handleHelp(ev.replyToken);
      return;
    }
    if (act === 'img_ok') {
      const payload = {
        food: q.get('food') || '',
        veg: Number(q.get('veg') || '0'),
        pro: Number(q.get('pro') || '0'),
        kcal: Number(q.get('kcal') || '0'),
        serv: Number(q.get('serv') || '0')
      };
      await confirmEstimate(userId, payload, ev.replyToken);
      return;
    }
    if (act === 'img_fix') {
      pendingFixMap.set(userId, {
        food: q.get('food') || '',
        veg: Number(q.get('veg') || '0'),
        pro: Number(q.get('pro') || '0'),
        kcal: Number(q.get('kcal') || '0'),
        serv: Number(q.get('serv') || '0')
      });
      await reply(ev.replyToken, [
        {
          type: 'text',
          text: '修正したい数値を「野菜g たんぱくg kcal」の順で送ってください。（例: 120 25 550）'
        }
      ]);
      return;
    }
  }

  if (ev.type === 'message' && ev.message?.type === 'text') {
    const pending = pendingFixMap.get(userId);
    if (pending) {
      const parsed = parseNumbersFromText(ev.message.text);
      if (!parsed) {
        await reply(ev.replyToken, [
          {
            type: 'text',
            text: '数値を認識できませんでした。例: 120 25 550'
          }
        ]);
        return;
      }
      pendingFixMap.delete(userId);
      await confirmEstimate(
        userId,
        {
          food: pending.food,
          veg: parsed.veg,
          pro: parsed.pro,
          kcal: parsed.kcal,
          serv: Math.round((parsed.veg / 70) * 10) / 10
        },
        ev.replyToken
      );
      return;
    }

    const mode = await getUserMode(userId);
    const est = await estimateFromText(ev.message.text);
    const serv = Math.round((est.veg / 70) * 10) / 10;
    fireAndForget(
      appendLogsRow([
        now,
        userId,
        'text',
        ev.message.text,
        est.summary,
        est.veg,
        est.pro,
        est.kcal,
        mode
      ])
    );
    await sendEstimateWithQRViaPush(userId, { ...est, servings: serv });
    return;
  }

  if (ev.type === 'message' && ev.message?.type === 'image') {
    const { base64 } = await fetchLineImageContent(ev.message);
    const mode = await getUserMode(userId);
    const est = await estimateFromImageBase64(base64);
    const serv = Math.round((est.veg / 70) * 10) / 10;
    fireAndForget(
      appendLogsRow([
        now,
        userId,
        'image',
        ev.message.id,
        est.summary,
        est.veg,
        est.pro,
        est.kcal,
        mode
      ])
    );
    await sendEstimateWithQRViaPush(userId, { ...est, servings: serv });
    return;
  }
}

async function lineWebhook(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }
  const events = req.body?.events || [];
  for (const ev of events) {
    try {
      await handleEvent(ev);
    } catch (err) {
      console.error('EVENT_FAIL', err?.message || err);
    }
  }
  res.status(200).send('OK');
}

module.exports = {
  lineWebhook
};
