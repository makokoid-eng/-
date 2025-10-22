import type { Client, WebhookEvent } from '@line/bot-sdk';
import { FieldValue } from 'firebase-admin/firestore';

import { getDb } from './firebase-admin.js';
import type { ReplyMessage } from './text-commands.js';

export async function handleFollow(
  event: WebhookEvent,
  lineClient: Client,
  replyMessage: ReplyMessage
): Promise<boolean> {
  if (event.type !== 'follow') {
    return false;
  }

  const userId = event.source?.userId ?? null;

  if (!userId) {
    console.warn('Missing userId for follow event', { source: event.source });
  } else {
    try {
      const profile = await lineClient.getProfile(userId);
      const firestore = getDb();
      const root = process.env.FIRESTORE_ROOT || 'users';
      const payload = {
        displayName: profile?.displayName ?? null,
        pictureUrl: profile?.pictureUrl ?? null,
        createdAt: FieldValue.serverTimestamp()
      };

      await firestore.collection(root).doc(userId).set(payload, { merge: true });
      console.log(`stage: follow profile saved ${root}/${userId}`);
    } catch (error) {
      console.error('Failed to persist follow profile', error);
    }
  }

  const replyToken = event.replyToken;
  if (!replyToken) {
    console.warn('Missing replyToken for follow event', { source: event.source });
    return true;
  }

  try {
    const followMessage = [
      '友だち追加ありがとう！📸 写真を送るとAIが要約して履歴に保存します。',
      '🧾「履歴」= 直近7日のまとめ',
      '🔁「ping save」= 保存テスト',
      '※ 未友だちやグループは個人IDが取れないため、まずはこのトークで友だち状態にしてね。'
    ].join('\n');

    await replyMessage(replyToken, { type: 'text', text: followMessage });
  } catch (error) {
    console.error('Failed to reply to follow event', error);
  }

  return true;
}
