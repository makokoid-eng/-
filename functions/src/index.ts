import * as functions from 'firebase-functions';
import axios from 'axios';

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
