const crypto = require('crypto');
const functions = require('@google-cloud/functions-framework');
const line = require('@line/bot-sdk');

const channelSecret = process.env.LINE_CHANNEL_SECRET;
const channelAccessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;

if (!channelSecret) {
  console.warn('LINE_CHANNEL_SECRET is not set. Signature validation will fail.');
}

if (!channelAccessToken) {
  console.warn('LINE_CHANNEL_ACCESS_TOKEN is not set. Replying to messages will fail.');
}

const client = new line.Client({
  channelSecret,
  channelAccessToken,
});

async function lineWebhook(req, res) {
  if (req.method !== 'POST') {
    res.status(405).send('Method Not Allowed');
    return;
  }

  const signature = req.get('x-line-signature');
  if (!signature || !isValidSignature(signature, req.rawBody)) {
    res.status(401).send('Invalid signature');
    return;
  }

  const events = Array.isArray(req.body?.events) ? req.body.events : [];
  try {
    await Promise.all(events.map(handleEvent));
    res.status(200).json({ status: 'ok' });
  } catch (error) {
    console.error('Error handling events', error);
    res.status(500).json({ error: 'Internal Server Error' });
  }
}

function isValidSignature(signature, rawBody) {
  if (!channelSecret || !rawBody) {
    return false;
  }

  const digest = crypto
    .createHmac('sha256', channelSecret)
    .update(rawBody)
    .digest('base64');
  return signature === digest;
}

async function handleEvent(event) {
  if (!event || !event.type) {
    return;
  }

  if (event.type === 'message' && event.message?.type === 'text') {
    const text = event.message.text ?? '';
    await client.replyMessage(event.replyToken, {
      type: 'text',
      text: text || 'Message received!'
    });
  }
}

functions.http('lineWebhook', lineWebhook);

module.exports = { lineWebhook };
