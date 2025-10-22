const MODE_HINTS = {
  user: '自分のペースで無理なく続けましょう。',
  group: 'メンバー同士で声を掛け合い、無理のない改善を。',
  room: '仲間と励まし合いながら、習慣づくりを意識しましょう。',
  unknown: 'こまめな記録が次の気づきにつながります。'
};

const GOAL_RULES = [
  {
    keys: ['weight-loss', 'fat-loss', '減量', 'ダイエット'],
    label: '減量',
    tip: '糖質と脂質の量を整えつつ、たんぱく質と野菜をしっかり。'
  },
  {
    keys: ['muscle-gain', 'strength', '筋力アップ', '増量'],
    label: '筋力アップ',
    tip: '十分なたんぱく質とエネルギーを確保し、食事回数も安定させましょう。'
  },
  {
    keys: ['wellness', 'maintenance', '健康維持'],
    label: '健康維持',
    tip: '主食・主菜・副菜のバランスを整えて、欠食を防ぎましょう。'
  }
];

const DEFAULT_TIP = 'バランスを意識しながら、無理のないペースで記録を続けましょう。';

function normalize(value) {
  return typeof value === 'string' ? value.trim() : '';
}

function normalizeKey(value) {
  return normalize(value).toLowerCase();
}

function findGoalRule(category) {
  const key = normalizeKey(category);
  if (!key) {
    return null;
  }

  for (const rule of GOAL_RULES) {
    if (rule.keys.some((candidate) => normalizeKey(candidate) === key)) {
      return rule;
    }
  }

  return null;
}

export function getGoalAdviceLine(options = {}) {
  const category = normalize(options.category);
  if (!category) {
    return null;
  }

  const rule = findGoalRule(category);
  const label = rule ? rule.label : category;
  const tip = rule ? rule.tip : DEFAULT_TIP;

  const modeKey = normalizeKey(options.mode);
  const modeHint = MODE_HINTS[modeKey] ?? MODE_HINTS.unknown;

  return `🎯 ${label}: ${tip} ${modeHint}`.trim();
}
