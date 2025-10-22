import type { MealResult } from './meals.js';

export type AiInput = {
  type: 'text' | 'image';
  text?: string;
  imageMessageId?: string;
};

/**
 * Dummy AI pipeline placeholder that will be replaced by a real model later.
 * Always resolves with a safe fallback message to keep the worker stable.
 */
export async function runAiPipeline(input: AiInput): Promise<MealResult> {
  if (input.type === 'image') {
    return {
      summary: '画像を受け取りました。現在解析中です。分析結果は後ほどお送りします。',
      ingredients: [],
      tags: [],
      meta: { pipeline: 'stub', inputType: input.type },
      estimates: null
    };
  }

  const text = input.text?.trim();
  if (!text) {
    return {
      summary: 'メッセージを受け取りました。詳細が分かり次第お知らせします。',
      ingredients: [],
      tags: [],
      meta: { pipeline: 'stub', inputType: input.type }
    };
  }

  return {
    summary: `「${text}」について調査しています。結果を少しお待ちください。`,
    ingredients: [],
    tags: [],
    meta: { pipeline: 'stub', inputType: input.type },
    estimates: null
  };
}
