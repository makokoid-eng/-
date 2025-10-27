import { Client } from '@line/bot-sdk';

let cachedClient = null;

function getClient() {
  if (cachedClient) return cachedClient;

  const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN_REPI;
  if (!channelAccessToken) {
    throw new Error('LINE_CHANNEL_ACCESS_TOKEN_REPI is not set');
  }

  cachedClient = new Client({ channelAccessToken });
  return cachedClient;
}

function normalizeMessages(messages) {
  const list = Array.isArray(messages) ? messages : [messages];

  return list.map((item) => {
    if (typeof item === 'string') {
      return { type: 'text', text: item };
    }
    if (item && typeof item === 'object') {
      return item;
    }
    throw new Error('Invalid message format provided to LINE client');
  });
}

export async function reply(replyToken, messages) {
  if (!replyToken) {
    throw new Error('replyToken is required');
  }

  const payload = normalizeMessages(messages);
  const client = getClient();
  await client.replyMessage(replyToken, payload);
}

export async function push(to, messages) {
  if (!to) {
    throw new Error('Recipient ID is required for push messages');
  }

  const payload = normalizeMessages(messages);
  const client = getClient();
  await client.pushMessage(to, payload);
}

export function resetClient() {
  cachedClient = null;
}
