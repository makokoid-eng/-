import nutritionTableJson from '../../cloud/functions/line-webhook/src/nutrition/table.json' assert { type: 'json' };

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
  const { totals, breakdown, meta: estimateMeta } = estimateNutrition({
    components,
    meta: meta ?? {},
    options: {}
  });

  const calories = toFiniteNumber(totals.calories);
  const protein = toFiniteNumber(totals.protein);
  const fiber = toFiniteNumber(totals.fiber);

  const vegetablesTotal = breakdown.reduce((sum, item) => {
    if (!item.matched) return sum;
    return matchesVegetable(item.label) ? sum + item.grams : sum;
  }, 0);

  const rawConfidence =
    toFiniteNumber(root.confidence) ??
    toFiniteNumber((meta as Record<string, unknown> | undefined)?.confidence);
  const clampedConfidence =
    rawConfidence === null ? null : Math.max(0, Math.min(1, rawConfidence));

  const assumptions = isPlainObject(root.assumptions)
    ? (root.assumptions as Record<string, unknown>)
    : null;

  const scale = {
    pxPerMm: roundOptional(estimateMeta.pxPerMm, 4),
    px_per_mm: roundOptional(estimateMeta.pxPerMm, 4),
    source: estimateMeta.scaleSource ?? null
  };

  const result: VisionEstimates = {
    vegetables_g: vegetablesTotal > 0 ? roundOptional(vegetablesTotal, 1) : null,
    protein_g: protein !== null ? roundOptional(protein, 1) : null,
    calories_kcal: calories !== null ? Math.round(calories) : null,
    fiber_g: fiber !== null ? roundOptional(fiber, 1) : null,
    confidence: clampedConfidence !== null ? roundOptional(clampedConfidence, 2) : null,
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
