const DEFAULT_PX_PER_MM = 3.7795275591; // 96dpi baseline

const numberOrNull = (value: unknown): number | null => {
  const num = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(num) ? num : null;
};

export interface ScaleSample {
  pxPerMm?: number;
  px_per_mm?: number;
  mmPerPx?: number;
  mm_per_px?: number;
  mm?: number;
  millimeters?: number;
  px?: number;
  pixels?: number;
  widthPx?: number;
  width_px?: number;
  widthMm?: number;
  width_mm?: number;
  heightPx?: number;
  height_px?: number;
  heightMm?: number;
  height_mm?: number;
}

export interface ScaleMeta {
  pxPerMm?: number;
  scale?: ScaleSample | ScaleSample[] | null;
  reference?: ScaleSample | ScaleSample[] | null;
  calibration?: ScaleSample | ScaleSample[] | null;
  references?: (ScaleSample | null | undefined)[] | null;
  calibrations?: (ScaleSample | null | undefined)[] | null;
  dpi?: number;
  image?: {
    dpi?: number;
    resolution?: { dpi?: number } | null;
    widthPx?: number;
    width_px?: number;
    widthMm?: number;
    width_mm?: number;
  } | null;
  mmPerPx?: number;
  mm_per_px?: number;
}

export interface ResolvedScale {
  pxPerMm: number;
  source: 'fallback' | 'direct' | 'meta' | 'single' | 'average';
}

const sampleToPxPerMm = (sample: ScaleSample | null | undefined): number | null => {
  if (!sample) return null;

  const directPxPerMm = numberOrNull(sample.pxPerMm ?? sample.px_per_mm);
  if (directPxPerMm && directPxPerMm > 0) {
    return directPxPerMm;
  }

  const mmPerPx = numberOrNull(sample.mmPerPx ?? sample.mm_per_px);
  if (mmPerPx && mmPerPx > 0) {
    return 1 / mmPerPx;
  }

  const widthPx = numberOrNull(
    sample.px ?? sample.pixels ?? sample.widthPx ?? sample.width_px
  );
  const widthMm = numberOrNull(sample.mm ?? sample.millimeters ?? sample.widthMm ?? sample.width_mm);
  if (widthPx && widthMm && widthMm > 0) {
    return widthPx / widthMm;
  }

  const heightPx = numberOrNull(sample.heightPx ?? sample.height_px);
  const heightMm = numberOrNull(sample.heightMm ?? sample.height_mm);
  if (heightPx && heightMm && heightMm > 0) {
    return heightPx / heightMm;
  }

  return null;
};

const dpiToPxPerMm = (dpi: number | null): number | null => {
  const num = numberOrNull(dpi);
  if (!num || num <= 0) return null;
  return num / 25.4;
};

const gatherSamples = (meta: ScaleMeta | number | null | undefined): ScaleSample[] => {
  if (!meta || typeof meta === 'number') return [];
  const nodes: Array<ScaleSample | ScaleSample[] | null | undefined> = [
    meta.scale,
    meta.reference,
    meta.calibration
  ];
  if (Array.isArray(meta.references)) nodes.push(...meta.references);
  if (Array.isArray(meta.calibrations)) nodes.push(...meta.calibrations);
  return nodes
    .flatMap((node) => (Array.isArray(node) ? node : [node]))
    .filter((value): value is ScaleSample => Boolean(value));
};

const average = (values: number[]): number | null => {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const DEFAULT_SCALE: ResolvedScale = {
  pxPerMm: DEFAULT_PX_PER_MM,
  source: 'fallback'
};

export const resolveScale = (meta: ScaleMeta | number | null | undefined): ResolvedScale => {
  if (typeof meta === 'number' && Number.isFinite(meta) && meta > 0) {
    return { pxPerMm: meta, source: 'direct' };
  }

  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    if (typeof meta.pxPerMm === 'number' && meta.pxPerMm > 0) {
      return { pxPerMm: meta.pxPerMm, source: 'meta' };
    }
  }

  const candidates: number[] = [];
  const samples = gatherSamples(meta);

  for (const sample of samples) {
    const pxPerMm = sampleToPxPerMm(sample);
    if (pxPerMm && pxPerMm > 0) {
      candidates.push(pxPerMm);
    }
  }

  if (meta && typeof meta === 'object' && !Array.isArray(meta)) {
    const dpi =
      numberOrNull(meta.dpi) ??
      numberOrNull(meta.image?.dpi) ??
      numberOrNull(meta.image?.resolution?.dpi) ??
      null;
    const inferredFromDpi = dpiToPxPerMm(dpi);
    if (inferredFromDpi && inferredFromDpi > 0) {
      candidates.push(inferredFromDpi);
    }

    const widthPx = numberOrNull(meta.image?.widthPx ?? meta.image?.width_px);
    const widthMm = numberOrNull(meta.image?.widthMm ?? meta.image?.width_mm);
    if (widthPx && widthMm && widthMm > 0) {
      candidates.push(widthPx / widthMm);
    }

    const mmPerPx = numberOrNull(meta.mmPerPx ?? meta.mm_per_px);
    if (mmPerPx && mmPerPx > 0) {
      candidates.push(1 / mmPerPx);
    }
  }

  if (!candidates.length) {
    return { ...DEFAULT_SCALE };
  }

  const pxPerMm = average(candidates);
  return {
    pxPerMm: pxPerMm ?? DEFAULT_PX_PER_MM,
    source: candidates.length === 1 ? 'single' : 'average'
  };
};

export const resolvePxPerMm = (meta: ScaleMeta | number | null | undefined): number =>
  resolveScale(meta).pxPerMm;

export { DEFAULT_PX_PER_MM };
