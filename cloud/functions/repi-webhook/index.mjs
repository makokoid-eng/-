import { onRequest } from 'firebase-functions/v2/https';
import { logger } from 'firebase-functions/logger';
import admin from 'firebase-admin';
import { validateSignature } from '@line/bot-sdk';
import { reply } from './line.js';

const FIRESTORE_ROOT = 'repi_users';
const channelSecret = process.env.LINE_CHANNEL_SECRET_REPI || '';
const projectId = process.env.FIREBASE_PROJECT_ID;

if (!admin.apps.length) {
  if (projectId) {
    admin.initializeApp({ projectId });
  } else {
    logger.warn('repiWebhook: FIREBASE_PROJECT_ID not set, falling back to default credentials');
    admin.initializeApp();
  }
}

const db = admin.firestore();
const FieldValue = admin.firestore.FieldValue;

function sanitizeMessage(message) {
  if (!message || typeof message !== 'object') return null;
  const allowed = { id: message.id, type: message.type };
  if (typeof message.text === 'string') {
    allowed.text = message.text;
  }
  if (typeof message.altText === 'string') {
    allowed.altText = message.altText;
  }
  return allowed;
}

function extractEventData(event) {
  const data = {};
  if (event.message) {
    data.message = sanitizeMessage(event.message);
  }
  if (event.postback) {
    data.postback = event.postback;
  }
  if (event.beacon) {
    data.beacon = event.beacon;
  }
  if (event.things) {
    data.things = event.things;
  }
  return data;
}

async function handleEvent(event) {
  if (!event || typeof event !== 'object') {
    logger.warn('repiWebhook: received empty event payload');
    return;
  }

  const source = event.source || {};
  const subjectId = source.userId || source.groupId || source.roomId;
  const subjectType = source.type || (source.groupId ? 'group' : source.roomId ? 'room' : 'user');

  if (!subjectId) {
    logger.warn('repiWebhook: source id missing, skip storing event');
    return;
  }

  const userDocRef = db.collection(FIRESTORE_ROOT).doc(subjectId);
  await userDocRef.set(
    {
      subjectType,
      lastEventAt: FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  const eventDoc = {
    type: event.type,
    messageType: event.message?.type || null,
    subjectType,
    timestamp: typeof event.timestamp === 'number' ? event.timestamp : null,
    data: extractEventData(event),
    createdAt: FieldValue.serverTimestamp(),
  };

  await userDocRef.collection('events').add(eventDoc);

  if (event.type === 'message' && event.message?.type === 'text' && event.replyToken) {
    const text = String(event.message.text || '').trim().toLowerCase();
    if (text === 'ping') {
      await reply(event.replyToken, 'Repi webhook: pong ✅');
    }
  }
}

export const repiWebhook = onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    res.status(405).send('Method Not Allowed');
    return;
  }

  if (!channelSecret) {
    logger.error('repiWebhook: LINE_CHANNEL_SECRET_REPI is not configured');
    res.status(500).send('Configuration error');
    return;
  }

  const signature = req.get('x-line-signature');
  const rawBody = req.rawBody || Buffer.from(JSON.stringify(req.body || {}));

  if (!signature || !validateSignature(rawBody, channelSecret, signature)) {
    logger.warn('repiWebhook: signature validation failed');
    res.status(401).send('Invalid signature');
    return;
  }

  const events = Array.isArray(req.body?.events) ? req.body.events : [];

  if (events.length === 0) {
    logger.info('repiWebhook: no events received');
    res.status(200).send({ status: 'ok', events: 0 });
    return;
  }

  await Promise.all(
    events.map(async (event) => {
      try {
        await handleEvent(event);
      } catch (error) {
        logger.error('repiWebhook: failed to handle event', error);
      }
    }),
  );

  res.status(200).send({ status: 'ok', events: events.length });
});
