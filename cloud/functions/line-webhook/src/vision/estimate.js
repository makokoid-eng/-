import nutritionTable from '../nutrition/table.json' assert { type: 'json' };
import { resolveScale, resolvePxPerMm, DEFAULT_PX_PER_MM } from './scale.js';

const round = (value, precision = 1) => {
  const num = Number(value);
  if (!Number.isFinite(num)) return 0;
  const factor = 10 ** precision;
  return Math.round(num * factor) / factor;
};

const normaliseKey = (value) =>
  typeof value === 'string' ? value.trim().toLowerCase() : '';

const indexTable = (table) => {
  const map = new Map();
  if (!table?.items) return map;
  for (const item of table.items) {
    if (!item) continue;
    const keys = new Set();
    if (item.id) keys.add(item.id);
    if (item.name) keys.add(item.name);
    if (Array.isArray(item.aliases)) {
      for (const alias of item.aliases) {
        keys.add(alias);
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

const pickNumber = (...values) => {
  for (const value of values) {
    const num = Number(value);
    if (Number.isFinite(num) && num > 0) {
      return num;
    }
  }
  return null;
};

const areaPxFromComponent = (component) => {
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
      component.boundingBox.width,
    );
    const height = pickNumber(
      component.boundingBox.heightPx,
      component.boundingBox.height_px,
      component.boundingBox.height,
    );
    if (width && height) return width * height;
  }

  return null;
};

const areaMm2FromComponent = (component, pxPerMm) => {
  const directArea = pickNumber(component?.areaMm2, component?.area_mm2);
  if (directArea) return directArea;

  const areaPx = areaPxFromComponent(component);
  if (!areaPx || !pxPerMm) return null;
  return areaPx / (pxPerMm * pxPerMm);
};

const volumeMlFromComponent = (component, pxPerMm, entry) => {
  const directVolume = pickNumber(component?.volumeMl, component?.volume_ml);
  if (directVolume) return directVolume;

  const thicknessMm = pickNumber(
    component?.thicknessMm,
    component?.thickness_mm,
    component?.depthMm,
    component?.depth_mm,
    entry?.thicknessMm,
    entry?.averageThicknessMm,
  );

  const areaMm2 = areaMm2FromComponent(component, pxPerMm);
  if (areaMm2 && thicknessMm) {
    const volumeMm3 = areaMm2 * thicknessMm;
    return volumeMm3 / 1000; // 1000 mm^3 = 1 mL
  }

  if (component?.servings && entry?.servingWeight) {
    const density = pickNumber(component?.density, entry?.density, DEFAULT_DENSITY);
    if (density) {
      return ((component.servings * entry.servingWeight) / density) || null;
    }
  }

  return null;
};

const gramsFromComponent = (component, entry, pxPerMm) => {
  const direct = pickNumber(
    component?.grams,
    component?.gram,
    component?.weightGrams,
    component?.weight,
    component?.massGrams,
    component?.mass,
  );
  if (direct) return direct;

  if (component?.servings && entry?.servingWeight) {
    return component.servings * entry.servingWeight;
  }

  const density = pickNumber(component?.density, entry?.density, DEFAULT_DENSITY) || 1;
  const volumeMl = volumeMlFromComponent(component, pxPerMm, entry);
  if (volumeMl) {
    return volumeMl * density;
  }

  const areaMm2 = areaMm2FromComponent(component, pxPerMm);
  if (areaMm2 && entry?.surfaceDensity) {
    return areaMm2 * entry.surfaceDensity;
  }

  return entry?.servingWeight || DEFAULT_SERVING;
};

const multiplyNutrients = (per100g, multiplier) => {
  const result = {};
  if (!per100g || !multiplier) return result;
  for (const [key, value] of Object.entries(per100g)) {
    const num = Number(value);
    if (!Number.isFinite(num)) continue;
    result[key] = round(num * multiplier);
  }
  return result;
};

const mergeTotals = (totals, nutrients) => {
  for (const [key, value] of Object.entries(nutrients)) {
    if (!Number.isFinite(value)) continue;
    totals[key] = round((totals[key] || 0) + value);
  }
};

const resolveEntry = (component) => {
  if (!component) return null;
  const keys = [
    component.id,
    component.foodId,
    component.food_id,
    component.code,
    component.label,
    component.name,
    component.title,
  ];
  for (const key of keys) {
    const norm = normaliseKey(key);
    if (!norm) continue;
    const entry = TABLE_INDEX.get(norm);
    if (entry) return entry;
  }
  return null;
};

export const estimateNutrition = ({ components = [], meta = {}, options = {} } = {}) => {
  const scale = options?.scale || resolveScale(meta);
  const pxPerMm = options?.pxPerMm || scale?.pxPerMm || DEFAULT_PX_PER_MM;

  const totals = {};
  const breakdown = [];

  for (const component of Array.isArray(components) ? components : []) {
    const entry = resolveEntry(component);
    if (!entry) {
      breakdown.push({
        id: component?.id ?? component?.name ?? component?.label ?? 'unknown',
        matched: false,
        grams: 0,
        nutrients: {},
      });
      continue;
    }

    const grams = round(gramsFromComponent(component, entry, pxPerMm), 1);
    const multiplier = grams / 100;
    const nutrients = multiplyNutrients(entry.per100g, multiplier);
    mergeTotals(totals, nutrients);

    breakdown.push({
      id: component?.id ?? entry.id,
      label: entry.name ?? component?.name ?? component?.label ?? entry.id,
      matched: true,
      grams,
      nutrients,
    });
  }

  return {
    totals,
    breakdown,
    meta: {
      pxPerMm,
      scaleSource: scale?.source ?? 'fallback',
    },
  };
};

export { resolveScale, resolvePxPerMm };
