import type { MealResult } from '../meals.js';

function formatIngredients(ingredients: readonly string[] | null | undefined): string | null {
  if (!Array.isArray(ingredients)) {
    return null;
  }

  const normalized = ingredients
    .filter((ingredient): ingredient is string => typeof ingredient === 'string')
    .map((ingredient) => ingredient.trim())
    .filter((ingredient) => ingredient.length > 0);

  if (normalized.length === 0) {
    return null;
  }

  const joined = normalized.slice(0, 5).join('・');
  return `主な具材: ${joined}`;
}

function formatTags(tags: readonly string[] | null | undefined): string | null {
  if (!Array.isArray(tags)) {
    return null;
  }

  const normalized = Array.from(
    new Set(
      tags
        .filter((tag): tag is string => typeof tag === 'string')
        .map((tag) => tag.trim())
        .filter((tag) => tag.length > 0)
    )
  );

  if (normalized.length === 0) {
    return null;
  }

  return `栄養バランス: ${normalized.join(' / ')}`;
}

function formatSummary(summary: string | null | undefined): string | null {
  const trimmed = typeof summary === 'string' ? summary.trim() : '';
  if (!trimmed) {
    return null;
  }
  return `要約: ${trimmed}`;
}

export function formatReplyV1(meal: MealResult | null | undefined, localTimeHHmm: string): string {
  const headerTime = localTimeHHmm?.trim() || '';
  const header = headerTime ? `🍽️ 食事レポート (${headerTime})` : '🍽️ 食事レポート';

  const summaryLine = formatSummary(meal?.summary ?? null);
  const ingredientsLine = formatIngredients(meal?.ingredients ?? null);
  const tagsLine = formatTags(meal?.tags ?? null);

  const body = [summaryLine, ingredientsLine, tagsLine].filter(
    (line): line is string => typeof line === 'string' && line.length > 0
  );

  if (body.length === 0) {
    return `${header}\n解析結果を取得できませんでした。`;
  }

  return [header, '', ...body].join('\n');
}
