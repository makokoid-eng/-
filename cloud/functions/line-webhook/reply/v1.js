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

const g = (v) => (v == null ? '—' : v <= 0 ? 'ごく少量(≦5g)' : `${v} g`);
const kcal = (v) => (v == null ? '—' : v <= 0 ? '少なめ' : `${v} kcal`);

const formatEstimatesBlock = (estimates) => {
  if (!estimates || typeof estimates !== 'object') return null;

  const parts = [];
  const vegetablesValue = isFiniteNumber(estimates.vegetables_g)
    ? Math.round(estimates.vegetables_g)
    : null;
  const vegetables = g(vegetablesValue);
  if (vegetables !== '—') parts.push(`野菜 ${vegetables}`);

  const proteinValue = isFiniteNumber(estimates.protein_g)
    ? Math.round(estimates.protein_g)
    : null;
  const protein = g(proteinValue);
  if (protein !== '—') parts.push(`たんぱく質 ${protein}`);

  const fiberValue = isFiniteNumber(estimates.fiber_g)
    ? Math.round(estimates.fiber_g)
    : null;
  const fiber = g(fiberValue);
  if (fiber !== '—') parts.push(`食物繊維 ${fiber}`);

  const caloriesValue = isFiniteNumber(estimates.calories_kcal)
    ? Math.round(estimates.calories_kcal)
    : null;
  const calories = kcal(caloriesValue);
  if (calories !== '—') parts.push(`エネルギー ${calories}`);

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
