import nutritionTableJson from '../../cloud/functions/line-webhook/src/nutrition/table.json' assert { type: 'json' };

// @ts-expect-error: JavaScript module without type declarations.
import { estimateNutrition as estimateNutritionV1_1 } from '../../cloud/functions/line-webhook/src/estimation/v1_1/estimate.js';
// @ts-expect-error: JavaScript module without type declarations.
import { estimateScale as estimateScaleV1_1 } from '../../cloud/functions/line-webhook/src/estimation/v1_1/scale.js';

import { DEFAULT_PX_PER_MM, resolveScale, type ScaleMeta } from './scale.js';

const nutritionTable = nutritionTableJson as NutritionTable;

type MaybeNumber = number | string | null | undefined;

type NutritionEntry = {
  id?: string;
  name?: string;
  aliases?: string[];
  servingWeight?: MaybeNumber;
  density?: MaybeNumber;
  thicknessMm?: MaybeNumber;
  averageThicknessMm?: MaybeNumber;
  surfaceDensity?: MaybeNumber;
  per100g?: Record<string, MaybeNumber> | null;
};

type NutritionTable = {
  defaults?: {
    servingWeight?: MaybeNumber;
    density?: MaybeNumber;
  } | null;
  items?: NutritionEntry[];
};

type BoundingBox = {
  widthPx?: MaybeNumber;
  width_px?: MaybeNumber;
  width?: MaybeNumber;
  heightPx?: MaybeNumber;
  height_px?: MaybeNumber;
  height?: MaybeNumber;
};

type SizePx = {
  width?: MaybeNumber;
  height?: MaybeNumber;
};

type VisionComponent = {
  id?: string;
  foodId?: string;
  food_id?: string;
  code?: string;
  label?: string;
  name?: string;
  title?: string;
  areaPx?: MaybeNumber;
  area_px?: MaybeNumber;
  area?: MaybeNumber;
  areaMm2?: MaybeNumber;
  area_mm2?: MaybeNumber;
  sizePx?: SizePx | null;
  boundingBox?: BoundingBox | null;
  thicknessMm?: MaybeNumber;
  thickness_mm?: MaybeNumber;
  depthMm?: MaybeNumber;
  depth_mm?: MaybeNumber;
  volumeMl?: MaybeNumber;
  volume_ml?: MaybeNumber;
  servings?: MaybeNumber;
  density?: MaybeNumber;
  grams?: MaybeNumber;
  gram?: MaybeNumber;
  weightGrams?: MaybeNumber;
  weight?: MaybeNumber;
  massGrams?: MaybeNumber;
  mass?: MaybeNumber;
  heightMm?: MaybeNumber;
  height_mm?: MaybeNumber;
  lengthPx?: MaybeNumber;
  length_px?: MaybeNumber;
};

type CoreComponentKind = 'salad' | 'rice' | 'meat' | 'fish' | 'tofu';

type CoreComponent = {
  kind: CoreComponentKind;
  area_mm2: number;
  height_mm?: number | null;
};

type ScaleDetection = {
  label: string;
  lengthPx: number;
  confidence: number | null;
};

type CoreEstimateResult = {
  vegetables_g?: MaybeNumber;
  protein_g?: MaybeNumber;
  fiber_g?: MaybeNumber;
  calories_kcal?: MaybeNumber;
  confidence?: MaybeNumber;
};

type ScaleEstimateResult = {
  source?: string;
  object_size_mm?: MaybeNumber;
  pixels?: MaybeNumber;
  px_per_mm?: MaybeNumber;
  confidence?: MaybeNumber;
};

type EstimateOptions = {
  components?: VisionComponent[] | null;
  meta?: ScaleMeta | Record<string, unknown> | null;
  options?: {
    scale?: ReturnType<typeof resolveScale> | null;
    pxPerMm?: MaybeNumber;
  } | null;
};

type EstimateBreakdownItem = {
  id: string;
  label?: string;
  matched: boolean;
  grams: number;
  nutrients: Record<string, number>;
};

type EstimateResult = {
  totals: Record<string, number>;
  breakdown: EstimateBreakdownItem[];
  meta: {
    pxPerMm: number;
    scaleSource: string;
  };
};

const round = (value: MaybeNumber, precision = 1): number => {
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
};

const toFiniteNumber = (value: MaybeNumber | unknown): number | null => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

const roundOptional = (value: MaybeNumber | unknown, precision = 1): number | null => {
  const num = toFiniteNumber(value);
  if (num === null) return null;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  Boolean(value) && typeof value === 'object' && !Array.isArray(value);

const normaliseKey = (value: unknown): string =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const indexTable = (table: NutritionTable): Map<string, NutritionEntry> => {
  const map = new Map<string, NutritionEntry>();
  if (!table?.items) return map;
  for (const item of table.items) {
    if (!item) continue;
    const keys = new Set<string>();
    if (item.id) keys.add(item.id);
    if (item.name) keys.add(item.name);
    if (Array.isArray(item.aliases)) {
      for (const alias of item.aliases) {
        if (alias) keys.add(alias);
      }
    }
    for (const key of keys) {
      const norm = normaliseKey(key);
      if (!norm) continue;
      if (!map.has(norm)) {
        map.set(norm, item);
      }
    }
  }
  return map;
};

const TABLE_INDEX = indexTable(nutritionTable);
const DEFAULT_SERVING = Number(nutritionTable?.defaults?.servingWeight) || 100;
const DEFAULT_DENSITY = Number(nutritionTable?.defaults?.density) || 1;

const pickNumber = (...values: MaybeNumber[]): number | null => {
  for (const value of values) {
    const num = typeof value === 'number' ? value : Number(value);
    if (Number.isFinite(num) && num > 0) {
      return num;
    }
  }
  return null;
};

const SCALE_LABEL_ALIASES: Record<string, string> = {
  箸: 'chopsticks',
  はし: 'chopsticks',
  おはし: 'chopsticks',
  フォーク: 'fork',
  ふぉーく: 'fork',
  スプーン: 'spoon',
  すぷーん: 'spoon',
  缶: 'can',
  カード: 'card',
  かーど: 'card',
  皿: 'plate',
  プレート: 'plate',
  さら: 'plate',
  コップ: 'cup',
  こっぷ: 'cup',
  グラス: 'cup'
};

const SCALE_LABELS = new Set([
  'chopsticks',
  'fork',
  'spoon',
  'can',
  'card',
  'plate',
  'cup'
]);

const SCALE_DETECTION_CHILD_KEYS = [
  'detected',
  'detections',
  'objects',
  'items',
  'scale',
  'scaleDetections',
  'samples'
];

const normalizeScaleLabel = (value: unknown): string | null => {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!trimmed) return null;
  const alias = SCALE_LABEL_ALIASES[trimmed] ?? SCALE_LABEL_ALIASES[trimmed.toLowerCase()];
  if (alias && SCALE_LABELS.has(alias)) {
    return alias;
  }
  const lower = trimmed.toLowerCase();
  return SCALE_LABELS.has(lower) ? lower : null;
};

const toScaleDetection = (value: unknown): ScaleDetection | null => {
  if (!isPlainObject(value)) return null;
  const record = value as Record<string, unknown>;
  const label =
    normalizeScaleLabel(record.label) ??
    normalizeScaleLabel(record.kind) ??
    normalizeScaleLabel(record.type) ??
    normalizeScaleLabel(record.name) ??
    normalizeScaleLabel(record.title) ??
    normalizeScaleLabel(record.code);

  const lengthRecord = record as Record<string, MaybeNumber>;
  const lengthPx = pickNumber(
    lengthRecord.lengthPx,
    lengthRecord.length_px,
    lengthRecord.length,
    lengthRecord.pixels,
    lengthRecord.px
  );

  if (!label || !lengthPx) {
    return null;
  }

  const confidence = toFiniteNumber(lengthRecord.confidence ?? lengthRecord.score);

  return {
    label,
    lengthPx,
    confidence: confidence !== null ? Math.max(0, Math.min(1, confidence)) : null
  };
};

const extractScaleDetections = (source: unknown): ScaleDetection[] => {
  const queue: unknown[] = [];
  const visited = new Set<unknown>();
  if (source !== null && source !== undefined) {
    queue.push(source);
  }

  const pushChild = (node: unknown, key: string): void => {
    if (!isPlainObject(node)) return;
    const child = (node as Record<string, unknown>)[key];
    if (Array.isArray(child) || isPlainObject(child)) {
      queue.push(child);
    }
  };

  const detections: ScaleDetection[] = [];
  const dedupe = new Set<string>();

  while (queue.length) {
    const node = queue.shift();
    if (!node || visited.has(node)) continue;
    visited.add(node);

    if (Array.isArray(node)) {
      for (const item of node) {
        if (Array.isArray(item) || isPlainObject(item)) {
          queue.push(item);
        } else {
          const detection = toScaleDetection(item);
          if (detection) {
            const key = `${detection.label}:${Math.round(detection.lengthPx * 1000)}`;
            if (!dedupe.has(key)) {
              dedupe.add(key);
              detections.push(detection);
            }
          }
        }
      }
      continue;
    }

    if (isPlainObject(node)) {
      const detection = toScaleDetection(node);
      if (detection) {
        const key = `${detection.label}:${Math.round(detection.lengthPx * 1000)}`;
        if (!dedupe.has(key)) {
          dedupe.add(key);
          detections.push(detection);
        }
      }

      for (const key of SCALE_DETECTION_CHILD_KEYS) {
        pushChild(node, key);
      }
    }
  }

  return detections;
};

const COMPONENT_KIND_KEYWORDS: Record<CoreComponentKind, readonly string[]> = {
  salad: [
    'salad',
    'vegetable',
    'vegetables',
    'greens',
    'veggie',
    'サラダ',
    '野菜',
    '菜',
    'レタス',
    'ブロッコリー',
    'ほうれん',
    '小松菜',
    'きゅうり',
    '胡瓜',
    'キャベツ',
    'トマト'
  ],
  rice: ['rice', 'ご飯', 'ごはん', '白米', '米', 'ライス'],
  meat: [
    'meat',
    'beef',
    'pork',
    'chicken',
    '肉',
    '牛',
    '豚',
    '鶏',
    'からあげ',
    '唐揚げ',
    'ステーキ',
    'ハンバーグ',
    'ソーセージ',
    'ベーコン',
    'ハム'
  ],
  fish: [
    'fish',
    'seafood',
    'salmon',
    'sashimi',
    'tuna',
    'mackerel',
    'さかな',
    '魚',
    '鮭',
    'サーモン',
    'さけ',
    'まぐろ',
    'マグロ',
    '鯖',
    'さば',
    'ぶり',
    '鰤'
  ],
  tofu: ['tofu', '豆腐', '厚揚げ', '揚げ出し']
};

const extractStringCandidates = (
  component: VisionComponent | null | undefined
): string[] => {
  if (!component || typeof component !== 'object') {
    return [];
  }

  const candidates = new Set<string>();

  const pushValue = (value: unknown): void => {
    if (typeof value !== 'string') return;
    const trimmed = value.trim();
    if (!trimmed) return;
    candidates.add(trimmed);
    candidates.add(trimmed.toLowerCase());
  };

  const record = component as Record<string, unknown>;
  pushValue((record.kind ?? record.category ?? record.type) as string | undefined);
  pushValue(component.code);
  pushValue(component.label);
  pushValue(component.name);
  pushValue(component.title);
  pushValue(component.foodId ?? component.food_id);
  pushValue(component.id);

  const tagValues = [record.tags, record.keywords, record.categories];
  for (const value of tagValues) {
    if (Array.isArray(value)) {
      for (const item of value) {
        pushValue(item);
      }
    }
  }

  return Array.from(candidates);
};

const resolveCoreKind = (
  component: VisionComponent | null | undefined
): CoreComponentKind | null => {
  const candidates = extractStringCandidates(component);
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    for (const [kind, keywords] of Object.entries(COMPONENT_KIND_KEYWORDS) as [
      CoreComponentKind,
      readonly string[]
    ][]) {
      if (keywords.some((keyword) => lower.includes(keyword.toLowerCase()))) {
        return kind;
      }
    }
  }
  return null;
};

const toCoreComponents = (
  components: VisionComponent[],
  pxPerMm: number | null
): CoreComponent[] => {
  const result: CoreComponent[] = [];
  const pxPerMmSafe = pxPerMm && pxPerMm > 0 ? pxPerMm : null;

  for (const component of components) {
    const kind = resolveCoreKind(component);
    if (!kind) continue;

    const areaMm2 = areaMm2FromComponent(component, pxPerMmSafe);
    if (!areaMm2 || areaMm2 <= 0) continue;

    const heightMm = pickNumber(
      component.heightMm,
      component.height_mm,
      component.thicknessMm,
      component.thickness_mm,
      component.depthMm,
      component.depth_mm
    );

    result.push({
      kind,
      area_mm2: areaMm2,
      height_mm: heightMm ?? null
    });
  }

  return result;
};

const areaPxFromComponent = (component: VisionComponent | null | undefined): number | null => {
  if (!component) return null;
  const area = pickNumber(component.areaPx, component.area_px, component.area);
  if (area) return area;

  if (component.sizePx && pickNumber(component.sizePx.width, component.sizePx.height)) {
    const width = pickNumber(component.sizePx.width);
    const height = pickNumber(component.sizePx.height);
    if (width && height) return width * height;
  }

  if (component.boundingBox) {
    const width = pickNumber(
      component.boundingBox.widthPx,
      component.boundingBox.width_px,
      component.boundingBox.width
    );
    const height = pickNumber(
      component.boundingBox.heightPx,
      component.boundingBox.height_px,
      component.boundingBox.height
    );
    if (width && height) return width * height;
  }

  return null;
};

const areaMm2FromComponent = (
  component: VisionComponent | null | undefined,
  pxPerMm: number | null
): number | null => {
  const directArea = pickNumber(component?.areaMm2, component?.area_mm2);
  if (directArea) return directArea;

  const areaPx = areaPxFromComponent(component);
  if (!areaPx || !pxPerMm) return null;
  return areaPx / (pxPerMm * pxPerMm);
};

const volumeMlFromComponent = (
  component: VisionComponent | null | undefined,
  pxPerMm: number | null,
  entry: NutritionEntry | null
): number | null => {
  const directVolume = pickNumber(component?.volumeMl, component?.volume_ml);
  if (directVolume) return directVolume;

  const thicknessMm = pickNumber(
    component?.thicknessMm,
    component?.thickness_mm,
    component?.depthMm,
    component?.depth_mm,
    entry?.thicknessMm,
    entry?.averageThicknessMm
  );

  const areaMm2 = areaMm2FromComponent(component, pxPerMm);
  if (areaMm2 && thicknessMm) {
    const volumeMm3 = areaMm2 * thicknessMm;
    return volumeMm3 / 1000;
  }

  if (component?.servings && entry?.servingWeight) {
    const density = pickNumber(component?.density, entry?.density, DEFAULT_DENSITY);
    if (density) {
      return ((Number(component.servings) * Number(entry.servingWeight)) / density) || null;
    }
  }

  return null;
};

const gramsFromComponent = (
  component: VisionComponent | null | undefined,
  entry: NutritionEntry | null,
  pxPerMm: number | null
): number => {
  const direct = pickNumber(
    component?.grams,
    component?.gram,
    component?.weightGrams,
    component?.weight,
    component?.massGrams,
    component?.mass
  );
  if (direct) return direct;

  if (component?.servings && entry?.servingWeight) {
    return Number(component.servings) * Number(entry.servingWeight);
  }

  const density = pickNumber(component?.density, entry?.density, DEFAULT_DENSITY) || 1;
  const volumeMl = volumeMlFromComponent(component, pxPerMm, entry);
  if (volumeMl) {
    return volumeMl * density;
  }

  const areaMm2 = areaMm2FromComponent(component, pxPerMm);
  if (areaMm2 && entry?.surfaceDensity) {
    return areaMm2 * Number(entry.surfaceDensity);
  }

  return Number(entry?.servingWeight) || DEFAULT_SERVING;
};

const multiplyNutrients = (
  per100g: Record<string, MaybeNumber> | null | undefined,
  multiplier: number
): Record<string, number> => {
  const result: Record<string, number> = {};
  if (!per100g || !multiplier) return result;
  for (const [key, value] of Object.entries(per100g)) {
    const num = typeof value === 'number' ? value : Number(value);
    if (!Number.isFinite(num)) continue;
    result[key] = round(num * multiplier);
  }
  return result;
};

const mergeTotals = (totals: Record<string, number>, nutrients: Record<string, number>): void => {
  for (const [key, value] of Object.entries(nutrients)) {
    if (!Number.isFinite(value)) continue;
    totals[key] = round((totals[key] || 0) + value);
  }
};

const resolveEntry = (component: VisionComponent | null | undefined): NutritionEntry | null => {
  if (!component) return null;
  const keys = [
    component.id,
    component.foodId,
    component.food_id,
    component.code,
    component.label,
    component.name,
    component.title
  ];
  for (const key of keys) {
    const norm = normaliseKey(key);
    if (!norm) continue;
    const entry = TABLE_INDEX.get(norm);
    if (entry) return entry;
  }
  return null;
};

export const estimateNutrition = ({
  components = [],
  meta = {},
  options = {}
}: EstimateOptions = {}): EstimateResult => {
  const scale = options?.scale ?? resolveScale(meta as ScaleMeta);
  const pxPerMm = options?.pxPerMm
    ? Number(options.pxPerMm)
    : scale?.pxPerMm ?? DEFAULT_PX_PER_MM;

  const totals: Record<string, number> = {};
  const breakdown: EstimateBreakdownItem[] = [];

  for (const component of Array.isArray(components) ? components : []) {
    const entry = resolveEntry(component);
    if (!entry) {
      breakdown.push({
        id: component?.id ?? component?.name ?? component?.label ?? 'unknown',
        matched: false,
        grams: 0,
        nutrients: {}
      });
      continue;
    }

    const grams = round(gramsFromComponent(component, entry, pxPerMm), 1);
    const multiplier = grams / 100;
    const nutrients = multiplyNutrients(entry.per100g, multiplier);
    mergeTotals(totals, nutrients);

    breakdown.push({
      id: component?.id ?? entry.id ?? 'unknown',
      label: entry.name ?? component?.name ?? component?.label ?? entry.id ?? 'unknown',
      matched: true,
      grams,
      nutrients
    });
  }

  return {
    totals,
    breakdown,
    meta: {
      pxPerMm,
      scaleSource: scale?.source ?? 'fallback'
    }
  };
};

const VEGETABLE_KEYWORDS = [
  'vegetable',
  'vegetables',
  'salad',
  'greens',
  'broccoli',
  'spinach',
  'lettuce',
  'cabbage',
  'tomato',
  'cucumber',
  'bell pepper',
  'carrot',
  'okra',
  'eggplant',
  'zucchini',
  'サラダ',
  '野菜',
  '菜',
  'ブロッコリー',
  'ほうれん',
  '小松菜',
  'トマト',
  'きゅうり',
  '胡瓜',
  'キャベツ',
  'にんじん',
  'ピーマン'
];

const matchesVegetable = (label: string | undefined): boolean => {
  if (!label) return false;
  const lower = label.toLowerCase();
  return VEGETABLE_KEYWORDS.some((keyword) =>
    lower.includes(keyword) || label.includes(keyword)
  );
};

const extractComponents = (source: unknown): VisionComponent[] => {
  if (Array.isArray(source)) {
    return source.filter((item): item is VisionComponent => isPlainObject(item));
  }
  if (isPlainObject(source)) {
    if (Array.isArray(source.components)) {
      return extractComponents(source.components);
    }
    if (Array.isArray(source.items)) {
      return extractComponents(source.items);
    }
  }
  return [];
};

export interface VisionEstimates {
  vegetables_g: number | null;
  protein_g: number | null;
  calories_kcal: number | null;
  fiber_g: number | null;
  confidence: number | null;
  scale: {
    pxPerMm: number | null;
    px_per_mm: number | null;
    source: string | null;
  };
  assumptions: Record<string, unknown> | null;
}

export const estimateFromVision = (vision: unknown): VisionEstimates | null => {
  const root = isPlainObject(vision) ? vision : {};
  const components = extractComponents(root.components ?? vision);
  const meta = isPlainObject(root.meta) ? (root.meta as ScaleMeta) : undefined;
  const scaleContext = isPlainObject(root)
    ? {
        scale: (root as Record<string, unknown>).scale,
        detected: (root as Record<string, unknown>).detected,
        detections: (root as Record<string, unknown>).detections,
        objects: (root as Record<string, unknown>).objects,
        scaleDetections: (root as Record<string, unknown>).scaleDetections,
        meta
      }
    : meta;

  const detectionSources: unknown[] = [scaleContext];
  if (meta) {
    detectionSources.push(meta);
  }

  const detectionMap = new Map<string, ScaleDetection>();
  for (const source of detectionSources) {
    const detections = extractScaleDetections(source);
    for (const detection of detections) {
      const key = `${detection.label}:${Math.round(detection.lengthPx * 1000)}`;
      if (!detectionMap.has(key)) {
        detectionMap.set(key, detection);
      }
    }
  }

  const scaleDetections = Array.from(detectionMap.values());
  const scaleEstimate: ScaleEstimateResult | null = scaleDetections.length
    ? (estimateScaleV1_1(
        scaleDetections.map((detection) => ({
          label: detection.label,
          length_px: detection.lengthPx,
          confidence: detection.confidence ?? undefined
        }))
      ) as ScaleEstimateResult)
    : null;

  const pxPerMmOverride = toFiniteNumber(scaleEstimate?.px_per_mm);

  const { totals, breakdown, meta: estimateMeta } = estimateNutrition({
    components,
    meta: meta ?? {},
    options: pxPerMmOverride ? { pxPerMm: pxPerMmOverride } : {}
  });

  const caloriesLegacy = toFiniteNumber(totals.calories);
  const proteinLegacy = toFiniteNumber(totals.protein);
  const fiberLegacy = toFiniteNumber(totals.fiber);

  const vegetablesTotalLegacy = breakdown.reduce((sum, item) => {
    if (!item.matched) return sum;
    return matchesVegetable(item.label) ? sum + item.grams : sum;
  }, 0);

  const pxPerMmCombined =
    pxPerMmOverride ??
    toFiniteNumber(estimateMeta.pxPerMm) ??
    (meta ? toFiniteNumber(meta.pxPerMm) : null) ??
    DEFAULT_PX_PER_MM;

  const coreComponents = components.length
    ? toCoreComponents(components, pxPerMmCombined)
    : [];

  const coreEstimate: CoreEstimateResult | null = coreComponents.length
    ? (estimateNutritionV1_1(
        coreComponents.map((component) => ({
          kind: component.kind,
          area_mm2: component.area_mm2,
          ...(component.height_mm ? { height_mm: component.height_mm } : {})
        }))
      ) as CoreEstimateResult)
    : null;

  const preferCore = (
    coreValue: MaybeNumber | undefined,
    legacyValue: MaybeNumber | null
  ): number | null => {
    const core = toFiniteNumber(coreValue);
    if (core !== null) {
      return core;
    }
    if (legacyValue === null || legacyValue === undefined) {
      return null;
    }
    return toFiniteNumber(legacyValue);
  };

  const vegetablesCombinedRaw = preferCore(
    coreEstimate?.vegetables_g as MaybeNumber,
    vegetablesTotalLegacy > 0 ? vegetablesTotalLegacy : null
  );
  const proteinCombinedRaw = preferCore(
    coreEstimate?.protein_g as MaybeNumber,
    proteinLegacy
  );
  const fiberCombinedRaw = preferCore(
    coreEstimate?.fiber_g as MaybeNumber,
    fiberLegacy
  );
  const caloriesCombinedRaw = preferCore(
    coreEstimate?.calories_kcal as MaybeNumber,
    caloriesLegacy
  );

  const rawConfidence =
    toFiniteNumber(root.confidence) ??
    toFiniteNumber((meta as Record<string, unknown> | undefined)?.confidence);
  const coreConfidence = toFiniteNumber(coreEstimate?.confidence as MaybeNumber);
  const selectedConfidence =
    rawConfidence !== null ? rawConfidence : coreConfidence;
  const clampedConfidence =
    selectedConfidence === null
      ? null
      : Math.max(0, Math.min(1, selectedConfidence));

  const assumptionsBase: Record<string, unknown> = isPlainObject(root.assumptions)
    ? { ...(root.assumptions as Record<string, unknown>) }
    : {};
  if (scaleEstimate) {
    assumptionsBase.v1_1_scale = {
      source:
        typeof scaleEstimate.source === 'string' && scaleEstimate.source
          ? scaleEstimate.source
          : null,
      px_per_mm: roundOptional(scaleEstimate.px_per_mm, 4),
      confidence: roundOptional(scaleEstimate.confidence, 2)
    };
  }
  if (coreComponents.length) {
    assumptionsBase.v1_1_components = coreComponents.length;
  }

  const assumptions =
    Object.keys(assumptionsBase).length > 0 ? assumptionsBase : null;

  const scaleSourceCandidate =
    typeof scaleEstimate?.source === 'string' ? scaleEstimate.source.trim() : '';
  const resolvedScaleSource =
    scaleSourceCandidate || estimateMeta.scaleSource || 'fallback';

  const scale = {
    pxPerMm: roundOptional(pxPerMmCombined, 4),
    px_per_mm: roundOptional(pxPerMmCombined, 4),
    source: resolvedScaleSource
  };

  const result: VisionEstimates = {
    vegetables_g:
      vegetablesCombinedRaw !== null && vegetablesCombinedRaw > 0
        ? roundOptional(vegetablesCombinedRaw, 1)
        : null,
    protein_g:
      proteinCombinedRaw !== null ? roundOptional(proteinCombinedRaw, 1) : null,
    calories_kcal:
      caloriesCombinedRaw !== null ? Math.round(caloriesCombinedRaw) : null,
    fiber_g:
      fiberCombinedRaw !== null ? roundOptional(fiberCombinedRaw, 1) : null,
    confidence:
      clampedConfidence !== null ? roundOptional(clampedConfidence, 2) : null,
    scale,
    assumptions
  };

  if (
    result.vegetables_g === null &&
    result.protein_g === null &&
    result.calories_kcal === null &&
    result.fiber_g === null &&
    result.confidence === null &&
    !components.length
  ) {
    return null;
  }

  return result;
};

export type { EstimateBreakdownItem, EstimateResult, VisionComponent };
