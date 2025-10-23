import crypto from 'crypto';
import axios from 'axios';
import OpenAI from 'openai';
import { Firestore, FieldValue } from '@google-cloud/firestore';
import { handleFollow } from './handlers/follow.js';
import { estimateScale } from './src/estimation/v1_1/scale.js';
import { estimateNutrition } from './src/estimation/v1_1/estimate.js';
import { normalizeKind } from './src/estimation/v1_1/normalizeKind.js';
import { formatReplyV1 } from './reply/v1.js';

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

async function saveMealResult({ userId, imageBytes, result, meta, estimates }) {
  if (!userId) {
    console.warn('stage: firestore skip - userId missing');
    return;
  }

  console.log('stage: firestore start');
  try {
    const collectionRef = db
      .collection(FIRESTORE_ROOT)
      .doc(userId)
      .collection('meals');

    const payload = {
      summary: result?.summary ?? '(no summary)',
      ingredients: Array.isArray(result?.ingredients) ? result.ingredients : [],
      imageBytes: typeof imageBytes === 'number' ? imageBytes : null, // 画像本体は保存しない
      model: 'gpt-4o-mini',
      source: 'line',
      createdAt: FieldValue.serverTimestamp(),
      meta: { ...(meta || {}), version: estimates ? 'v1.1' : 'v1' },
    };

    if (estimates) {
      payload.estimates = estimates;
    }

    const docRef = await collectionRef.add(payload);
    console.log(
      'stage: firestore saved',
      `${FIRESTORE_ROOT}/${userId}/meals/${docRef.id}`,
    );
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

async function handleTextCommand({ event, text, senderId, replyToken }) {
  const normalizedText = (text || '').trim().toLowerCase();
  console.log('stage: text event received =', normalizedText);

  if (!normalizedText) {
    console.log('stage: handleTextCommand return=', false);
    return false;
  }

  if (normalizedText === 'id') {
    console.log('stage: id matched');
    if (replyToken) {
      const mode = event?.source?.type || 'unknown';
      const replyStatus = await replyLine(
        replyToken,
        `senderId=${senderId || '(missing)'}\nsource=${mode}`,
      );
      console.log('reply status=', replyStatus);
    }
    console.log('stage: handleTextCommand return=', true);
    return true;
  }

  if (normalizedText === 'ping save') {
    console.log('stage: ping save received');
    if (!senderId) {
      console.warn('stage: firestore skip - senderId missing');
      if (replyToken) {
        const replyStatus = await replyLine(
          replyToken,
          '⚠️ senderId が取得できませんでした',
        );
        console.log('reply status=', replyStatus);
      }
      console.log('stage: handleTextCommand return=', true);
      return true;
    }

    await canarySave(senderId);
    if (replyToken) {
      const replyStatus = await replyLine(replyToken, '✅保存テストOK');
      console.log('reply status=', replyStatus);
    }
    console.log('stage: handleTextCommand return=', true);
    return true;
  }

  console.log('stage: handleTextCommand return=', false);
  return false;
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
            role: 'system',
            content:
              'あなたの出力は必ずJSON形式とし、以下のキーを含めてください:\n{\n  "summary": "...料理全体の要約...",\n  "ingredients": ["...","..."],\n  "components": [\n    {"kind": "rice", "area_px": 22000, "height_mm": 45},\n    {"kind": "salad", "area_px": 14000, "height_mm": 30},\n    {"kind": "meat", "area_px": 9000, "height_mm": 20}\n  ],\n  "scaleCandidates": [\n    {"label": "plate", "length_px": 230, "confidence": 0.8}\n  ]\n}\ncomponents は料理を構成する要素を示し、各要素に area_px (画素数) と kind を含めます。\nscaleCandidates にはスケール取得可能な物体（箸、皿、缶、名刺など）の情報を含めます。\nsummary と ingredients はこれまで通り生成してください。\nこれらのキーが存在しない場合は空配列として返すようにする。',
          },
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text:
                  'この料理写真を短く要約し、主要な具材を3つ抽出し、日本語で返答。あなたの出力は必ずJSON形式とし、{"summary":"...料理全体の要約...","ingredients":["...","..."],"components":[{"kind":"rice","area_px":22000,"height_mm":45},{"kind":"salad","area_px":14000,"height_mm":30},{"kind":"meat","area_px":9000,"height_mm":20}],"scaleCandidates":[{"label":"plate","length_px":230,"confidence":0.8}]} の形式を守り、components と scaleCandidates が欠ける場合は空配列として返すようにする。',
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
    if (!Array.isArray(obj.components)) obj.components = [];
    if (!Array.isArray(obj.scaleCandidates)) obj.scaleCandidates = [];
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
    const text = ev?.message?.text || '';
    const replyToken = ev.replyToken;
    const senderId = getSenderId(ev?.source);

    if (ev?.type === 'follow') {
      return handleFollow({
        event: ev,
        res,
        fetchLineProfile,
        db,
        FieldValue,
        FIRESTORE_ROOT,
        replyLine,
      });
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
      const handledTextCommand = await handleTextCommand({
        event: ev,
        text,
        senderId,
        replyToken,
      });
      if (handledTextCommand) {
        return res.status(200).send('ok');
      }
    }

    if (ev.message?.type === 'image') {
      console.log('v1.1 start: image handler');
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
      let estimates = null;
      try {
        result = await summarizeMealFromBase64(imageBase64);
        const vision = result?.vision || null;
        console.log('v1.1 vision keys:', Object.keys(vision || {}));
        const scaleCandidates = Array.isArray(vision?.scaleCandidates)
          ? vision.scaleCandidates
          : [];
        const components = Array.isArray(vision?.components)
          ? vision.components
          : [];
        const ingredients = Array.isArray(result?.ingredients)
          ? result.ingredients
          : [];
        console.log('v1.1 scaleCandidates.len=', scaleCandidates.length);
        console.log('v1.1 components.len=', components.length);

        try {
          const scale = estimateScale(scaleCandidates);
          let pxmm = Number(scale?.px_per_mm || 3.0);
          if (!Number.isFinite(pxmm) || pxmm <= 0) pxmm = 3.0;
          pxmm = Math.min(Math.max(pxmm, 0.8), 10);
          const toMm2 = (px) => (px || 0) / (pxmm * pxmm);
          console.log('v1.1 px_per_mm=', pxmm);
          const componentsMm = components
            .map((c) => ({
              kind: normalizeKind(c?.kind),
              area_mm2: toMm2(Number(c?.area_px)),
              height_mm: c?.height_mm,
            }))
            .filter(
              (c) =>
                c.kind !== 'soup' && Number.isFinite(c.area_mm2) && c.area_mm2 > 50,
            );

          if (componentsMm.length) {
            estimates = estimateNutrition(componentsMm);
          } else {
            const s = ingredients.join(' ');
            const comp = [];
            if (/サラダ|野菜/.test(s))
              comp.push({ kind: 'salad', area_mm2: 20000, height_mm: 30 });
            if (/ご飯|米|おにぎり|麺|そうめん|そば|うどん/.test(s))
              comp.push({ kind: 'rice', area_mm2: 25000, height_mm: 45 });
            if (/卵|肉|鶏|豚|牛|魚|貝/.test(s))
              comp.push({
                kind: /卵/.test(s)
                  ? 'tofu'
                  : /魚|貝/.test(s)
                  ? 'fish'
                  : 'meat',
                area_mm2: 12000,
                height_mm: 18,
              });
            estimates = comp.length
              ? estimateNutrition(comp)
              : {
                  vegetables_g: 0,
                  protein_g: 0,
                  calories_kcal: 0,
                  fiber_g: 0,
                  confidence: 0.4,
                };
            console.log('v1.1 fallback.used=true comp.len=', comp.length);
          }

          if (estimates && typeof estimates === 'object') {
            estimates.scale = {
              source: scale?.source,
              object_size_mm: scale?.object_size_mm,
              pixels: scale?.pixels,
              px_per_mm: pxmm,
            };
            estimates.assumptions = {
              salad_height_mm: 30,
              rice_height_mm: 45,
              meat_height_mm: 18,
            };
          }
          console.log('v1.1 estimates:', estimates);
        } catch (estimationError) {
          console.error(
            'v1.1 estimation error',
            estimationError?.message || estimationError,
          );
        }

        if (estimates) {
          result.estimates = estimates;
        }

        if (!senderId) {
          console.warn('stage: firestore skip - senderId missing');
        } else {
          console.log('stage: before saveMealResult');
          await saveMealResult({
            userId: senderId,
            imageBytes: imageBase64?.length || 0,
            result,
            meta: { source: 'line-image' },
            estimates,
          });
          console.log('stage: after saveMealResult');
        }
        const msg = formatReplyV1({
          summary: result?.summary,
          ingredients: Array.isArray(result?.ingredients)
            ? result.ingredients.slice(0, 3)
            : [],
          estimates,
        });
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
