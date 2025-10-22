import { FieldValue } from 'firebase-admin/firestore';

import { getDb } from './firebase-admin.js';

export interface MealResult {
  summary?: string | null;
  ingredients?: string[] | null;
}

export interface SaveMealResultParams {
  userId: string | null | undefined;
  aiResult: MealResult | null | undefined;
  imageBytesBase64?: string | null;
  meta?: Record<string, unknown>;
}

export async function saveMealResult({
  userId,
  aiResult,
  imageBytesBase64,
  meta
}: SaveMealResultParams): Promise<string | null> {
  if (!userId) {
    console.warn('senderId not found; skip save');
    return null;
  }

  console.log('stage: before saveMealResult');
  console.log('stage: firestore start');

  const firestore = getDb();
  const root = process.env.FIRESTORE_ROOT || 'users';

  const rawIngredients = Array.isArray(aiResult?.ingredients) ? aiResult?.ingredients ?? [] : [];
  const ingredients = rawIngredients.filter((ingredient): ingredient is string => typeof ingredient === 'string');

  const summaryValue = aiResult?.summary;
  const summary = typeof summaryValue === 'string' ? summaryValue : null;

  const payload = {
    summary,
    ingredients,
    imageBytes: imageBytesBase64
      ? { kind: 'base64' as const, length: imageBytesBase64.length }
      : null,
    model: 'gpt-4o-mini',
    createdAt: FieldValue.serverTimestamp(),
    meta: {
      source: 'line',
      ts: Date.now(),
      ...(meta ?? {})
    }
  };

  const docRef = await firestore
    .collection(root)
    .doc(userId)
    .collection('meals')
    .add(payload);

  console.log(`stage: firestore saved ${root}/${userId}/meals/${docRef.id}`);
  console.log('stage: after saveMealResult');
  return docRef.id;
}
