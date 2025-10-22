import { FieldValue } from 'firebase-admin/firestore';

import { getDb } from './firebase-admin.js';

const PROTEIN_KEYWORDS = [
  '鶏',
  '豚',
  '牛',
  '魚',
  'まぐろ',
  'さけ',
  '卵',
  '豆腐',
  '納豆',
  '大豆',
  'ﾖｰｸﾞﾙﾄ',
  'ヨーグルト',
  'チーズ',
  'ﾁｰｽﾞ',
  'ハム',
  'ﾊﾑ',
  'ベーコン'
] as const;

const CARB_KEYWORDS = [
  'ご飯',
  '米',
  'パン',
  '麺',
  'パスタ',
  'うどん',
  'そば',
  '餅',
  '芋',
  'じゃが',
  'さつまいも'
] as const;

const VEGETABLE_KEYWORDS = [
  'サラダ',
  'レタス',
  'キャベツ',
  'トマト',
  'きゅうり',
  '胡瓜',
  'ブロッコリー',
  '小松菜',
  'ほうれん草',
  'にんじん'
] as const;

const FAT_KEYWORDS = [
  '揚げ',
  'フライ',
  '天ぷら',
  'バター',
  'マヨ',
  '油',
  'オイル'
] as const;

type KeywordList = readonly string[];

function includesAny(source: string, keywords: KeywordList): boolean {
  return keywords.some((word) => source.includes(word));
}

export function inferTags(ingredients: readonly string[] = []): string[] {
  const normalized = (ingredients ?? []).filter(
    (ingredient): ingredient is string => typeof ingredient === 'string'
  );
  const joined = normalized.join('').toLowerCase();

  const tags: string[] = [];

  if (joined && includesAny(joined, PROTEIN_KEYWORDS)) {
    tags.push('たんぱく質');
  }

  if (joined && includesAny(joined, CARB_KEYWORDS)) {
    tags.push('炭水化物');
  }

  if (joined && includesAny(joined, VEGETABLE_KEYWORDS)) {
    tags.push('野菜');
  }

  if (joined && includesAny(joined, FAT_KEYWORDS)) {
    tags.push('油脂');
  }

  return Array.from(new Set(tags));
}

export interface MealResult {
  summary?: string | null;
  ingredients?: string[] | null;
  tags?: string[] | null;
  meta?: Record<string, unknown> | null;
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

  const rawTags = Array.isArray(aiResult?.tags) ? aiResult.tags : [];
  const normalizedTags = rawTags
    .filter((tag): tag is string => typeof tag === 'string')
    .map((tag) => tag.trim())
    .filter((tag) => tag.length > 0);
  const tags = normalizedTags.length > 0 ? Array.from(new Set(normalizedTags)) : inferTags(ingredients);

  const aiMeta =
    aiResult?.meta && typeof aiResult.meta === 'object' && !Array.isArray(aiResult.meta)
      ? { ...aiResult.meta }
      : {};
  const payloadMeta = {
    source: 'line',
    ts: Date.now(),
    ...(meta ?? {}),
    ...aiMeta
  };

  const payload = {
    summary,
    ingredients,
    tags,
    imageBytes: imageBytesBase64
      ? { kind: 'base64' as const, length: imageBytesBase64.length }
      : null,
    model: 'gpt-4o-mini',
    createdAt: FieldValue.serverTimestamp(),
    meta: payloadMeta
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
