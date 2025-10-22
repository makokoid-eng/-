import type { WebhookEvent } from '@line/bot-sdk';

export type LineSource = WebhookEvent['source'];
export type SourceKind = 'user' | 'group' | 'room' | 'unknown';

export function getSenderId(src: LineSource | null | undefined): string | null {
  return src?.userId ?? src?.groupId ?? src?.roomId ?? null;
}

export function getSourceKind(src: LineSource | null | undefined): SourceKind {
  if (src?.userId) return 'user';
  if (src?.groupId) return 'group';
  if (src?.roomId) return 'room';
  return 'unknown';
}
