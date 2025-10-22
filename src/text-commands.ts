import type { Message, WebhookEvent } from '@line/bot-sdk';
import { Timestamp } from 'firebase-admin/firestore';

import { getSenderId, getSourceKind } from './line-source.js';
import { getDb } from './firebase-admin.js';

export type ReplyMessage = (replyToken: string, message: Message | Message[]) => Promise<void>;

export async function handleTextCommand(event: WebhookEvent, replyMessage: ReplyMessage): Promise<boolean> {
  if (event.type !== 'message' || event.message.type !== 'text') {
    return false;
  }

  const text = event.message.text?.trim();
  if (!text) {
    return false;
  }

  const senderId = getSenderId(event.source);
  const mode = getSourceKind(event.source);

  if (text === 'id') {
    await replyMessage(event.replyToken, {
      type: 'text',
      text: `senderId=${senderId}\nmode=${mode}`
    });
    return true;
  }

  if (text === 'ping save') {
    if (!senderId) {
      await replyMessage(event.replyToken, {
        type: 'text',
        text: 'senderIdが取得できません（未友だち・特殊ルームの可能性）。友だち追加後に再実行してください。'
      });
      return true;
    }

    console.log('stage: firestore canary start');
    const firestore = getDb();
    const root = process.env.FIRESTORE_ROOT || 'users';
    const docId = `canary_${new Date().toISOString().replace(/[:.]/g, '')}`;

    await firestore
      .collection(root)
      .doc(senderId)
      .collection('meals')
      .doc(docId)
      .set({
        kind: 'canary',
        createdAt: Timestamp.now(),
        meta: { mode }
      });

    console.log(`stage: firestore canary saved ${root}/${senderId}/meals/${docId}`);
    await replyMessage(event.replyToken, { type: 'text', text: 'canary保存OK ✅' });
    return true;
  }

  return false;
}
