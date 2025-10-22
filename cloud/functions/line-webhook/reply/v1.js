const isFiniteNumber = (value) =>
  typeof value === 'number' && Number.isFinite(value);

const formatSummary = (summary) => {
  const trimmed = typeof summary === 'string' ? summary.trim() : '';
  if (!trimmed) return null;
  return `要約: ${trimmed}`;
};

const formatIngredients = (ingredients) => {
  if (!Array.isArray(ingredients)) return null;
  const normalized = ingredients
    .filter((item) => typeof item === 'string')
    .map((item) => item.trim())
    .filter((item) => item.length > 0);
  if (normalized.length === 0) return null;
  return `主な具材: ${normalized.slice(0, 5).join('・')}`;
};

const formatDecimal = (value, digits = 1) => {
  if (!isFiniteNumber(value)) return null;
  const factor = 10 ** digits;
  const rounded = Math.round(value * factor) / factor;
  return Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(digits);
};

const formatEstimatesBlock = (estimates) => {
  if (!estimates || typeof estimates !== 'object') return null;

  const parts = [];
  const vegetables = formatDecimal(estimates.vegetables_g);
  if (vegetables) parts.push(`野菜 ${vegetables}g`);

  const protein = formatDecimal(estimates.protein_g);
  if (protein) parts.push(`たんぱく質 ${protein}g`);

  const fiber = formatDecimal(estimates.fiber_g);
  if (fiber) parts.push(`食物繊維 ${fiber}g`);

  const calories = isFiniteNumber(estimates.calories_kcal)
    ? Math.round(estimates.calories_kcal).toString()
    : null;
  if (calories) parts.push(`エネルギー ${calories}kcal`);

  const lines = ['📏 量の目安'];
  if (parts.length > 0) {
    lines.push(parts.join(' / '));
  }

  const confidenceText = isFiniteNumber(estimates.confidence)
    ? `信頼度: ${Math.round(estimates.confidence * 100)}%`
    : null;
  if (confidenceText) {
    lines.push(confidenceText);
  }

  if (parts.length > 0 || confidenceText) {
    lines.push('※±20% 程度の誤差があります');
  }

  if (lines.length === 1) {
    return null;
  }

  return lines.join('\n');
};

export function formatReplyV1(meal = {}) {
  const lines = ['🍽️ AI解析結果'];

  const summaryLine = formatSummary(meal.summary);
  if (summaryLine) {
    lines.push(summaryLine);
  }

  const ingredientsLine = formatIngredients(meal.ingredients);
  if (ingredientsLine) {
    lines.push(ingredientsLine);
  }

  const estimatesBlock = formatEstimatesBlock(meal.estimates);
  if (estimatesBlock) {
    if (lines.length > 0) {
      lines.push('');
    }
    lines.push(estimatesBlock);
  }

  return lines.join('\n');
}
