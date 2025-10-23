import * as functions from 'firebase-functions';
import axios from 'axios';
import { getFirebaseAdmin } from './firebaseAdmin';

type LineMessage = {
  id?: string;
  type: string;
  text?: string;
};

type LineEvent = {
  replyToken?: string;
  type: string;
  message?: LineMessage;
};

type LineWebhookRequestBody = {
  events?: LineEvent[];
};

type SaveDiaryRequestBody = {
  userId?: string;
  customer?: {
    nickname?: string;
  };
  memo?: string;
  tags?: string[];
  theme: string;
  strength: 'soft' | 'normal' | 'hard';
  emojiLevel: number;
  toneHint: string;
  draftText: string;
};

async function replyTextMessage(
  replyToken: string,
  messageText: string,
  accessToken: string,
): Promise<void> {
  await axios.post(
    'https://api.line.me/v2/bot/message/reply',
    {
      replyToken,
      messages: [
        {
          type: 'text',
          text: `受け取りました：${messageText}`,
        },
      ],
    },
    {
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
    },
  );
}

export const lineWebhook = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  const accessToken = functions.config().line?.token;
  if (!accessToken) {
    console.error('LINE access token is not configured.');
    return res.status(500).send('Configuration error');
  }

  const body = (req.body ?? {}) as LineWebhookRequestBody;
  const events = Array.isArray(body.events) ? body.events : [];

  for (const event of events) {
    if (
      event.type === 'message' &&
      event.replyToken &&
      event.message?.type === 'text' &&
      typeof event.message.text === 'string'
    ) {
      try {
        await replyTextMessage(event.replyToken, event.message.text, accessToken);
      } catch (error) {
        console.error('Failed to reply to LINE message', error);
      }
    }
  }

  return res.status(200).send('ok');
});

export const saveDiary = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const body = (req.body ?? {}) as SaveDiaryRequestBody;
    const admin = getFirebaseAdmin();
    const db = admin.firestore();

    const explicitUserId = typeof body.userId === 'string' ? body.userId.trim() : '';
    const headerUserId = req.headers['x-mock-uid'];
    const headerUserIdValue = Array.isArray(headerUserId)
      ? headerUserId[0]
      : typeof headerUserId === 'string'
      ? headerUserId
      : '';
    const uid = explicitUserId || headerUserIdValue || 'demo';

    const customerNickname = body.customer?.nickname ?? null;
    const memo = typeof body.memo === 'string' ? body.memo : null;
    const tags = Array.isArray(body.tags)
      ? body.tags.filter((tag): tag is string => typeof tag === 'string')
      : [];
    const { theme, strength, emojiLevel, toneHint, draftText } = body;

    if (typeof theme !== 'string' || theme.trim() === '') {
      return res.status(400).json({ ok: false, error: 'Invalid theme' });
    }

    if (!['soft', 'normal', 'hard'].includes(strength)) {
      return res.status(400).json({ ok: false, error: 'Invalid strength' });
    }

    if (typeof emojiLevel !== 'number') {
      return res.status(400).json({ ok: false, error: 'Invalid emojiLevel' });
    }

    if (typeof toneHint !== 'string') {
      return res.status(400).json({ ok: false, error: 'Invalid toneHint' });
    }

    if (typeof draftText !== 'string') {
      return res.status(400).json({ ok: false, error: 'Invalid draftText' });
    }

    const visitRef = await db
      .collection('users')
      .doc(uid)
      .collection('visits')
      .add({
        customerNickname,
        memo,
        tags,
        theme,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    const draftRef = await db
      .collection('users')
      .doc(uid)
      .collection('diary_drafts')
      .add({
        sourceVisitId: visitRef.id,
        draftText,
        toneHint,
        strength,
        emojiLevel,
        createdAt: admin.firestore.FieldValue.serverTimestamp(),
      });

    return res.status(200).json({
      ok: true,
      visitId: visitRef.id,
      draftId: draftRef.id,
    });
  } catch (error) {
    console.error('Failed to save diary', error);
    return res.status(500).json({ ok: false });
  }
});
