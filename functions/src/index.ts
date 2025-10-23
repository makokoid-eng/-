import * as functions from 'firebase-functions';
import axios from 'axios';
import './firebase';

type LineTextMessageEvent = {
  replyToken?: string;
  type?: string;
  message?: {
    type?: string;
    text?: string;
  };
};

type LineWebhookRequest = {
  events?: LineTextMessageEvent[];
};

export const lineWebhook = functions.https.onRequest(async (req: functions.https.Request, res: functions.Response) => {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    return res.sendStatus(405);
  }

  const accessToken = functions.config().line?.token;
  if (!accessToken) {
    functions.logger.error('LINE access token is not configured.');
    return res.sendStatus(500);
  }

  const body = (req.body ?? {}) as LineWebhookRequest;
  const events = Array.isArray(body.events) ? body.events : [];

  for (const event of events) {
    if (
      event?.type === 'message' &&
      event.replyToken &&
      event.message?.type === 'text' &&
      typeof event.message.text === 'string'
    ) {
      try {
        await axios.post(
          'https://api.line.me/v2/bot/message/reply',
          {
            replyToken: event.replyToken,
            messages: [
              {
                type: 'text',
                text: `受け取りました：${event.message.text}`,
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
      } catch (error) {
        functions.logger.error('Failed to reply to LINE message.', error);
      }
    }
  }

  return res.sendStatus(200);
});
