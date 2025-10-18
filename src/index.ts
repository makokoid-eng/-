import 'dotenv/config';
import express, { Request, Response } from 'express';
import { Client, middleware, MiddlewareConfig, WebhookEvent } from '@line/bot-sdk';
import { enqueue } from './tasks.js';
import { runAiPipeline } from './ai.js';
import { logDone, logError, logQueued } from './store.js';
import { appendRow } from './sheets_legacy.js';

interface TaskPayload {
  userId: string;
  type: 'text' | 'image';
  text?: string;
  imageMessageId?: string;
  logId?: string;
}

const lineConfig: MiddlewareConfig = {
  channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN ?? '',
  channelSecret: process.env.LINE_CHANNEL_SECRET ?? ''
};

const lineClient = new Client({ channelAccessToken: lineConfig.channelAccessToken });
const app = express();

const dualWriteEnabled = (process.env.DUAL_WRITE ?? 'false').toLowerCase() === 'true';

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).send('ok');
});

app.post('/line/webhook', middleware(lineConfig), async (req: Request, res: Response) => {
  const events = (req.body.events ?? []) as WebhookEvent[];

  await Promise.all(
    events.map(async (event) => {
      try {
        if (event.type !== 'message') {
          return;
        }

        if (event.message.type !== 'text' && event.message.type !== 'image') {
          return;
        }

        const replyToken = event.replyToken;
        const userId = event.source.userId;
        if (!replyToken || !userId) {
          return;
        }

        const replyText = event.message.type === 'image'
          ? '画像を受け取りました。分析中です。完了後にお送りします。'
          : '受け取りました。分析を開始します。完了次第お送りします。';

        await lineClient.replyMessage(replyToken, [{ type: 'text', text: replyText }]);

        let logId: string | undefined;
        try {
          logId = await logQueued({
            userId,
            kind: event.message.type,
            messageId: event.message.id
          });
        } catch (error) {
          console.error('Failed to record queued log', error);
        }

        if (dualWriteEnabled) {
          try {
            await appendRow({
              userId,
              kind: event.message.type,
              messageId: event.message.id,
              note: 'queued'
            });
          } catch (error) {
            console.error('Legacy Sheets append failed', error);
          }
        }

        const payload: TaskPayload = {
          userId,
          type: event.message.type,
          text: event.message.type === 'text' ? event.message.text : undefined,
          imageMessageId: event.message.type === 'image' ? event.message.id : undefined,
          logId
        };

        try {
          await enqueue(payload);
        } catch (enqueueError) {
          console.error('Failed to enqueue task', enqueueError);
          if (logId) {
            try {
              await logError(logId, enqueueError);
            } catch (error) {
              console.error('Failed to mark log as error after enqueue failure', error);
            }
          }
        }
      } catch (error) {
        console.error('Failed to handle event', error);
      }
    })
  );

  res.status(200).send('ok');
});

app.post('/tasks/worker', express.json(), async (req: Request, res: Response) => {
  const payload = req.body as TaskPayload;
  if (!payload || !payload.userId || !payload.type) {
    res.status(400).send('invalid payload');
    return;
  }

  const { logId } = payload;
  const start = Date.now();

  try {
    const aiInput = payload.type === 'image'
      ? { type: 'image' as const, imageMessageId: payload.imageMessageId }
      : { type: 'text' as const, text: payload.text };

    const aiResult = await runAiPipeline(aiInput);
    await lineClient.pushMessage(payload.userId, [{ type: 'text', text: aiResult }]);

    const latencyMs = Date.now() - start;

    if (logId) {
      try {
        await logDone(logId, {
          resultSummary: aiResult,
          latencyMs
        });
      } catch (error) {
        console.error('Failed to mark log as done', error);
      }
    }

    res.status(200).send('ok');
  } catch (error) {
    console.error('Worker failed', error);

    if (logId) {
      try {
        await logError(logId, error);
      } catch (logErrorErr) {
        console.error('Failed to mark log as error', logErrorErr);
      }
    }

    res.status(500).send('error');
  }
});

export default app;
