import type { MealResult } from '../meals.js';

export function legacyFormatReply(meal: MealResult | null | undefined, _localTimeHHmm: string): string {
  const summary = typeof meal?.summary === 'string' ? meal.summary.trim() : '';
  const ingredients = Array.isArray(meal?.ingredients)
    ? meal?.ingredients
        .filter((ingredient): ingredient is string => typeof ingredient === 'string')
        .map((ingredient) => ingredient.trim())
        .filter((ingredient) => ingredient.length > 0)
    : [];

  const topIngredients = ingredients.slice(0, 3);

  const lines = ['🍽️ AI解析結果'];

  if (summary) {
    lines.push(`要約: ${summary}`);
  }

  if (topIngredients.length > 0) {
    lines.push(`主な具材: ${topIngredients.join('・')}`);
  }

  if (lines.length === 1) {
    return '解析結果を取得できませんでした。';
  }

  return lines.join('\n');
}
