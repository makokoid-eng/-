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

const isFiniteNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value);

const trimToLength = (text: string, maxLength: number): string => {
  const chars = Array.from(text);
  if (chars.length <= maxLength) {
    return text;
  }
  return `${chars.slice(0, maxLength - 1).join('')}…`;
};

const formatDecimal = (value: number | null | undefined, digits = 1): string | null => {
  if (!isFiniteNumber(value)) {
    return null;
  }
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits);
};

function formatEstimatesBlock(estimates: MealResult['estimates']): string | null {
  if (!estimates) {
    return null;
  }

  const parts: string[] = [];

  const vegetables = formatDecimal(estimates.vegetables_g);
  if (vegetables) {
    parts.push(`野菜 ${vegetables}g`);
  }

  const protein = formatDecimal(estimates.protein_g);
  if (protein) {
    parts.push(`たんぱく質 ${protein}g`);
  }

  const fiber = formatDecimal(estimates.fiber_g);
  if (fiber) {
    parts.push(`食物繊維 ${fiber}g`);
  }

  const calories = isFiniteNumber(estimates.calories_kcal)
    ? Math.round(estimates.calories_kcal).toString()
    : null;
  if (calories) {
    parts.push(`エネルギー ${calories}kcal`);
  }

  const lines: string[] = ['📏 量の目安'];
  if (parts.length > 0) {
    lines.push(parts.join(' / '));
  }

  const confidenceText = isFiniteNumber(estimates.confidence)
    ? `信頼度: ${Math.round(estimates.confidence * 100)}%`
    : null;
  if (confidenceText) {
    lines.push(confidenceText);
  }

  if (lines.length === 1) {
    return null;
  }

  return trimToLength(lines.join('\n'), 350);
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

  const estimatesBlock = formatEstimatesBlock(meal?.estimates ?? null);

  if (body.length === 0) {
    if (!estimatesBlock) {
      return `${header}\n解析結果を取得できませんでした。`;
    }

    const lines = [header];
    lines.push('');
    lines.push(estimatesBlock);
    return lines.join('\n');
  }

  const lines = [header, '', ...body];

  if (estimatesBlock) {
    if (lines[lines.length - 1] !== '') {
      lines.push('');
    }
    lines.push(estimatesBlock);
  }

  return lines.join('\n');
}
