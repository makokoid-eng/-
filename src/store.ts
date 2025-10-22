import { getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, Firestore, getFirestore } from 'firebase-admin/firestore';

import type { SourceKind } from './line-source.js';

interface LogQueuedInput {
  userId: string;
  kind: string;
  messageId?: string;
  sourceKind?: SourceKind;
}

interface LogDoneExtra {
  resultSummary?: string;
  latencyMs?: number;
}

if (!getApps().length) {
  initializeApp({
    projectId: process.env.GCP_PROJECT_ID
  });
}

const db: Firestore = getFirestore();
const collection = db.collection('lineLogs');

export async function logQueued(input: LogQueuedInput): Promise<string> {
  const docRef = collection.doc();
  await docRef.set({
    status: 'queued',
    createdAt: FieldValue.serverTimestamp(),
    userId: input.userId,
    kind: input.kind,
    messageId: input.messageId ?? null,
    sourceKind: input.sourceKind ?? null,
    error: null,
    resultSummary: null,
    latencyMs: null
  });
  return docRef.id;
}

export async function logDone(docId: string, extra: LogDoneExtra): Promise<void> {
  const docRef = collection.doc(docId);
  await docRef.set(
    {
      status: 'done',
      finishedAt: FieldValue.serverTimestamp(),
      resultSummary: extra.resultSummary ?? null,
      latencyMs: extra.latencyMs ?? null,
      error: null
    },
    { merge: true }
  );
}

export async function logError(docId: string, err: unknown): Promise<void> {
  const docRef = collection.doc(docId);
  const errorPayload = serializeError(err);
  await docRef.set(
    {
      status: 'error',
      finishedAt: FieldValue.serverTimestamp(),
      error: errorPayload
    },
    { merge: true }
  );
}

function serializeError(err: unknown): { message: string; stack?: string } {
  if (err instanceof Error) {
    return {
      message: err.message,
      stack: err.stack
    };
  }

  return {
    message: typeof err === 'string' ? err : JSON.stringify(err)
  };
}
