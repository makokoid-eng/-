import 'dotenv/config';
import express, { Request, Response } from 'express';
import { Client, middleware, MiddlewareConfig, WebhookEvent } from '@line/bot-sdk';
import { enqueue } from './tasks.js';
import { runAiPipeline } from './ai.js';
import { logDone, logError, logQueued } from './store.js';
import { appendRow } from './sheets_legacy.js';
import { getSenderId, getSourceKind } from './line-source.js';
import { handleFollow } from './follow.js';
import { handleTextCommand, type ReplyMessage } from './text-commands.js';
import { saveMealResult, type MealResult } from './meals.js';
import { formatReplyV1 } from './reply/v1.js';
import { legacyFormatReply } from './reply/legacy.js';
import { inferTags as inferReplyTags } from './reply/tagsV1.js';

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
const jstFormatter = new Intl.DateTimeFormat('ja-JP', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
  timeZone: 'Asia/Tokyo'
});

app.get('/healthz', (_req: Request, res: Response) => {
  res.status(200).send('ok');
});

const replyMessage: ReplyMessage = async (replyToken, message) => {
  const messages = Array.isArray(message) ? message : [message];
  await lineClient.replyMessage(replyToken, messages);
};

app.post('/line/webhook', middleware(lineConfig), async (req: Request, res: Response) => {
  const events = (req.body.events ?? []) as WebhookEvent[];

  await Promise.all(
    events.map(async (event) => {
      try {
        const handledFollow = await handleFollow(event, lineClient, replyMessage);
        if (handledFollow) {
          return;
        }

        if (event.type !== 'message') {
          return;
        }

        if (event.message.type !== 'text' && event.message.type !== 'image') {
          return;
        }

        const replyToken = event.replyToken;

        if (!replyToken) {
          console.warn('Missing replyToken for event', { source: event.source });
          return;
        }

        if (event.message.type === 'text') {
          const handled = await handleTextCommand(event, replyMessage);
          if (handled) {
            return;
          }
        }

        const senderId = getSenderId(event.source);
        const sourceKind = getSourceKind(event.source);

        if (!senderId) {
          console.warn('Missing senderId for event', {
            sourceKind,
            source: event.source
          });
          return;
        }

        const replyText = event.message.type === 'image'
          ? '画像を受け取りました。分析中です。完了後にお送りします。'
          : '受け取りました。分析を開始します。完了次第お送りします。';

        await lineClient.replyMessage(replyToken, [{ type: 'text', text: replyText }]);

        let logId: string | undefined;
        try {
          logId = await logQueued({
            userId: senderId,
            kind: event.message.type,
            messageId: event.message.id,
            sourceKind
          });
        } catch (error) {
          console.error('Failed to record queued log', error);
        }

        if (dualWriteEnabled) {
          try {
            await appendRow({
              userId: senderId,
              kind: event.message.type,
              messageId: event.message.id,
              note: 'queued',
              sourceKind
            });
          } catch (error) {
            console.error('Legacy Sheets append failed', error);
          }
        }

        const payload: TaskPayload = {
          userId: senderId,
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

    const normalizedIngredients = Array.isArray(aiResult?.ingredients)
      ? aiResult.ingredients
          .filter((ingredient): ingredient is string => typeof ingredient === 'string')
          .map((ingredient) => ingredient.trim())
          .filter((ingredient) => ingredient.length > 0)
      : [];
    const normalizedTags = Array.isArray(aiResult?.tags)
      ? Array.from(
          new Set(
            aiResult.tags
              .filter((tag): tag is string => typeof tag === 'string')
              .map((tag) => tag.trim())
              .filter((tag) => tag.length > 0)
          )
        )
      : [];
    const aiMeta =
      aiResult?.meta && typeof aiResult.meta === 'object' && !Array.isArray(aiResult.meta)
        ? { ...aiResult.meta }
        : undefined;

    const meal: MealResult = {
      summary: typeof aiResult?.summary === 'string' && aiResult.summary.trim().length > 0
        ? aiResult.summary.trim()
        : null,
      ingredients: normalizedIngredients,
      tags: normalizedTags.length > 0 ? normalizedTags : undefined,
      meta: aiMeta
    };

    const useV1 = process.env.FEATURE_REPLY_V1 === 'true';
    if (!meal.tags?.length && meal.ingredients?.length) {
      meal.tags = inferReplyTags(meal.ingredients);
    }
    meal.meta = { ...(meal.meta ?? {}), version: 'v1' };

    const localTimeHHmm = jstFormatter.format(new Date());
    const messageText = useV1
      ? formatReplyV1(meal, localTimeHHmm)
      : legacyFormatReply(meal, localTimeHHmm);

    await lineClient.pushMessage(payload.userId, [{ type: 'text', text: messageText }]);

    if (payload.type === 'image') {
      const meta: Record<string, unknown> = {
        kind: 'image',
        ...(logId ? { logId } : {}),
        ...(payload.imageMessageId ? { imageMessageId: payload.imageMessageId } : {})
      };

      try {
        await saveMealResult({
          userId: payload.userId,
          aiResult: meal,
          meta
        });
      } catch (error) {
        console.error('Failed to save meal result', error);
      }
    }

    const latencyMs = Date.now() - start;

    if (logId) {
      try {
        await logDone(logId, {
          resultSummary: messageText,
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
