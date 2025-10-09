const { google } = require('googleapis');
const crypto = require('crypto');

let sheetsClient;

async function getSheetsClient() {
  if (!sheetsClient) {
    const auth = await google.auth.getClient({
      scopes: ['https://www.googleapis.com/auth/spreadsheets']
    });
    sheetsClient = google.sheets({ version: 'v4', auth });
  }
  return sheetsClient;
}

function verifyLineSignature(req) {
  const channelSecret = process.env.LINE_CHANNEL_SECRET;
  if (!channelSecret) {
    console.error('LINE_CHANNEL_SECRET is not configured.');
    return false;
  }

  const signature = req.headers['x-line-signature'];
  if (!signature) {
    console.error('Missing X-Line-Signature header.');
    return false;
  }

  const bodyBuffer = req.rawBody || Buffer.from(JSON.stringify(req.body || {}), 'utf8');
  const hmac = crypto.createHmac('sha256', channelSecret);
  hmac.update(bodyBuffer);
  const digest = hmac.digest('base64');
  return digest === signature;
}

async function appendLogRow(values) {
  const sheetId = process.env.SHEET_ID;
  if (!sheetId) {
    throw new Error('SHEET_ID is not configured.');
  }

  const sheets = await getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: sheetId,
    range: 'logs!A:Z',
    valueInputOption: 'USER_ENTERED',
    requestBody: {
      values: [values]
    }
  });
}

async function replyToLine(event, message) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    console.error('LINE_CHANNEL_ACCESS_TOKEN is not configured.');
    return;
  }

  if (!event.replyToken) {
    return;
  }

  const response = await fetch('https://api.line.me/v2/bot/message/reply', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`
    },
    body: JSON.stringify({
      replyToken: event.replyToken,
      messages: [
        {
          type: 'text',
          text: message
        }
      ]
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Failed to reply to LINE: ${response.status} ${text}`);
  }
}

async function handleEvent(event) {
  if (!event || event.type !== 'message') {
    return;
  }

  const timestamp = new Date(event.timestamp || Date.now()).toISOString();
  const userId = event.source?.userId || '';
  const messageType = event.message?.type || 'unknown';
  const messageText = event.message?.text || '';

  try {
    await appendLogRow([timestamp, userId, messageType, messageText]);
  } catch (error) {
    console.error('Failed to append row to Google Sheets:', error);
    throw error;
  }

  const replyMessage = messageText
    ? `記録しました: ${messageText}`
    : '記録しました。';

  await replyToLine(event, replyMessage);
}

async function app(req, res) {
  if (process.env.HEALTHZ_ENABLED === 'true' && req.method === 'GET' && req.url.startsWith('/healthz')) {
    res.status(200).send('ok');
    return;
  }

  if (req.method !== 'POST') {
    res.status(200).send('LINE webhook is running.');
    return;
  }

  const requiredEnv = ['LINE_CHANNEL_SECRET', 'LINE_CHANNEL_ACCESS_TOKEN', 'SHEET_ID'];
  const missingEnv = requiredEnv.filter((key) => !process.env[key]);
  if (missingEnv.length > 0) {
    console.error('Missing environment variables:', missingEnv.join(', '));
    res.status(500).send('Configuration error.');
    return;
  }

  if (!verifyLineSignature(req)) {
    res.status(403).send('Signature verification failed.');
    return;
  }

  const events = Array.isArray(req.body?.events) ? req.body.events : [];

  const results = await Promise.allSettled(events.map((event) => handleEvent(event)));

  const errors = results.filter((result) => result.status === 'rejected');
  if (errors.length > 0) {
    errors.forEach((error) => {
      console.error('Failed to handle LINE event:', error.reason);
    });
  }

  res.status(200).send('OK');
}

module.exports = { app };
