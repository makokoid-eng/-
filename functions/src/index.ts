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

type GenerateDiaryRequestBody = {
  theme?: unknown;
  toneHint?: unknown;
};

const toneHints = ['ふわっと', '大人', '語尾弱め'] as const;

export const generateDiary = functions.https.onRequest(async (req, res) => {
  if (req.method !== 'POST') {
    res.set('Allow', 'POST');
    return res.status(405).send('Method Not Allowed');
  }

  try {
    const body = (req.body ?? {}) as GenerateDiaryRequestBody;
    const rawTheme = typeof body.theme === 'string' ? body.theme.trim() : '';
    const rawToneHint = typeof body.toneHint === 'string' ? body.toneHint.trim() : undefined;

    if (!rawTheme) {
      return res.status(400).json({ error: 'theme is required' });
    }

    if (rawToneHint && !toneHints.includes(rawToneHint as (typeof toneHints)[number])) {
      return res.status(400).json({ error: 'toneHint is invalid' });
    }

    const toneHint = rawToneHint as (typeof toneHints)[number] | undefined;

    // TODO: Replace mock generation with OpenAI API call using functions.config().openai.key
    const variants = Array.from({ length: 3 }).map((_, index) => {
      const toneLabel = toneHint ? `トーン「${toneHint}」` : '標準トーン';
      return `${index + 1}つ目の案：${toneLabel}でテーマ「${rawTheme}」の日記を綴る下書きです。`;
    });

    return res.status(200).json({ variants });
  } catch (error) {
    console.error('Failed to generate diary', error);
    return res.status(500).json({ error: 'internal_error' });
  }
});
