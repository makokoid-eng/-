import crypto from 'crypto';
import axios from 'axios';
import OpenAI from 'openai';
import { Firestore, FieldValue } from '@google-cloud/firestore';

// プロジェクトIDは自動検出でOK。明示したい場合は projectId を渡す。
// const db = new Firestore({ projectId: process.env.GCP_PROJECT_ID });
const db = new Firestore();

// ルートコレクション名は環境変数で上書き可
const FIRESTORE_ROOT = process.env.FIRESTORE_ROOT || 'users';

const openaiApiKey = process.env.OPENAI_API_KEY;
if (!openaiApiKey) {
  console.error('stage: ai init error - OPENAI_API_KEY missing');
}
const openai = openaiApiKey ? new OpenAI({ apiKey: openaiApiKey }) : null;
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
const channelSecret = process.env.LINE_CHANNEL_SECRET;

function getSenderId(source) {
  return source?.userId || source?.groupId || source?.roomId || null;
}

async function fetchLineProfile(userId) {
  if (!userId) throw new Error('userId is required');
  if (!channelAccessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');

  const resp = await axios.get(`https://api.line.me/v2/bot/profile/${userId}`, {
    headers: {
      Authorization: `Bearer ${channelAccessToken}`,
    },
  });

  return resp?.data || null;
}

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

  const resp = await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    {
      replyToken,
      messages: [{ type: 'text', text }],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
    },
  );
  return resp.status;
}

async function pushLine(to, text) {
  if (!channelAccessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');

  const resp = await axios.post(
    'https://api.line.me/v2/bot/message/push',
    {
      to,
      messages: [{ type: 'text', text }],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${channelAccessToken}`,
      },
    },
  );
  return resp.status;
}

async function downloadImageAsBase64(messageId) {
  if (!channelAccessToken) throw new Error('LINE_CHANNEL_ACCESS_TOKEN is not set');

  const r = await axios.get(
    `https://api-data.line.me/v2/bot/message/${messageId}/content`,
    {
      headers: {
        Authorization: `Bearer ${channelAccessToken}`,
      },
      responseType: 'arraybuffer',
    },
  );
  if (r.status !== 200) throw new Error(`LINE content ${r.status}`);
  const buf = Buffer.from(r.data);
  console.log('stage: image downloaded');
  const base64 = buf.toString('base64');
  console.log('stage: image to base64 length=', base64?.length || 0);
  return base64;
}

async function saveMealResult({ userId, imageBytes, result, meta }) {
  if (!userId) {
    console.warn('stage: firestore skip - userId missing');
    return;
  }

  console.log('stage: firestore start');
  try {
    const ts = new Date().toISOString().replace(/[:.]/g, '');
    const docRef = db
      .collection(FIRESTORE_ROOT)
      .doc(userId)
      .collection('meals')
      .doc(ts);

    const payload = {
      summary: result?.summary ?? '(no summary)',
      ingredients: Array.isArray(result?.ingredients) ? result.ingredients : [],
      imageBytes: typeof imageBytes === 'number' ? imageBytes : null, // 画像本体は保存しない
      model: 'gpt-4o-mini',
      createdAt: FieldValue.serverTimestamp(),
      meta: meta || {},
    };

    await docRef.set(payload);
    console.log('stage: firestore saved', docRef.path);
  } catch (e) {
    console.error('stage: firestore error', e?.message || e);
  }
}

async function canarySave(userId) {
  console.log('stage: firestore canary start');
  const ts = new Date().toISOString().replace(/[:.]/g, '');
  const docRef = db
    .collection(FIRESTORE_ROOT)
    .doc(userId)
    .collection('meals')
    .doc(`canary_${ts}`);
  await docRef.set({
    summary: 'canary',
    ingredients: [],
    createdAt: FieldValue.serverTimestamp(),
    meta: { source: 'canary' },
  });
  console.log('stage: firestore canary saved', docRef.path);
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

const app = async (req, res) => {
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

  console.log(
    'stage: event',
    'type=', ev?.type,
    'msgType=', ev?.message?.type,
    'text=', ev?.message?.text,
  );

  try {
    const isText = ev?.type === 'message' && ev?.message?.type === 'text';
    const text = (ev?.message?.text || '').trim().toLowerCase();
    const replyToken = ev.replyToken;
    const senderId = getSenderId(ev?.source);

    if (ev?.type === 'follow') {
      const userId = ev?.source?.userId;
      console.log('stage: follow event received, userId=', userId);

      if (!userId) {
        console.warn('stage: follow handler skipped - userId missing');
        return res.status(200).send('ok');
      }

      try {
        const profile = await fetchLineProfile(userId);
        const payload = {
          displayName: profile?.displayName ?? null,
          pictureUrl: profile?.pictureUrl ?? null,
          createdAt: FieldValue.serverTimestamp(),
        };

        await db.collection(FIRESTORE_ROOT).doc(userId).set(payload, { merge: true });
        console.log('stage: follow profile saved');
      } catch (error) {
        console.error('stage: follow handler error', error?.message || error);
      }

      if (replyToken) {
        const followMessage = [
          '友だち追加ありがとう！📸 写真を送るとAIが要約して履歴に保存します。',
          '🧾「履歴」= 直近7日のまとめ',
          '🔁「ping save」= 保存テスト',
          '※ 未友だちやグループは個人IDが取れないため、まずはこのトークで友だち状態にしてね。',
        ].join('\n');
        const replyStatus = await replyLine(replyToken, followMessage);
        console.log('reply status=', replyStatus);
      }

      return res.status(200).send('ok');
    }

    console.log(
      'stage: senderId =',
      senderId,
      'userId=',
      ev?.source?.userId,
      'groupId=',
      ev?.source?.groupId,
      'roomId=',
      ev?.source?.roomId,
    );

    if (isText) {
      console.log('stage: text event received =', text);
      if (text.replace(/\s+/g, '') === 'pingsave') {
        if (!senderId) {
          console.warn('stage: firestore skip - senderId missing');
          if (replyToken) {
            const replyStatus = await replyLine(
              replyToken,
              '⚠️ senderId が取得できませんでした',
            );
            console.log('reply status=', replyStatus);
          }
          return res.sendStatus(200);
        }

        await canarySave(senderId);
        if (replyToken) {
          const replyStatus = await replyLine(replyToken, '✅保存テストOK');
          console.log('reply status=', replyStatus);
        }
        return res.sendStatus(200);
      }
    }

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
        if (senderId) {
          const pushStatus = await pushLine(
            senderId,
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
        if (!senderId) {
          console.warn('stage: firestore skip - senderId missing');
        } else {
          console.log('stage: before saveMealResult');
          await saveMealResult({
            userId: senderId,
            imageBytes: imageBase64?.length || 0,
            result,
            meta: { source: 'line-image', version: 1 },
          });
          console.log('stage: after saveMealResult');
        }
        const msg = `🍽️ AI解析結果\n要約: ${result.summary}\n主な具材: ${result.ingredients.slice(0, 3).join('・')}`;
        if (senderId) {
          const pushStatus = await pushLine(senderId, msg);
          console.log('push status=', pushStatus);
        }
      } catch (e) {
        console.log('stage: ai fallback');
        if (senderId) {
          const pushStatus = await pushLine(
            senderId,
            '解析に失敗しました🙏もう一度お試しください',
          );
          console.log('push status=', pushStatus);
        }
      } finally {
        console.log('stage: handler end');
      }

      return res.status(200).send('ok');
    }

    if (isText && replyToken) {
      const replyStatus = await replyLine(
        replyToken,
        '画像を送るとAIが要約します📷🍽',
      );
      console.log('reply status=', replyStatus);
      return res.status(200).send('ok');
    }

    return res.status(200).send('ok');
  } catch (e) {
    console.error('post-handler error', e);
    try {
      const senderId = getSenderId(ev?.source);
      if (senderId) {
        const pushStatus = await pushLine(
          senderId,
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

export { app };
