const DEFAULT_PX_PER_MM = 3.7795275591; // 96dpi baseline

const numberOrNull = (value) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : null;
};

const sampleToPxPerMm = (sample) => {
  if (!sample) return null;

  const directPxPerMm =
    numberOrNull(sample.pxPerMm) ??
    numberOrNull(sample.px_per_mm) ??
    null;
  if (directPxPerMm && directPxPerMm > 0) {
    return directPxPerMm;
  }

  const mmPerPx =
    numberOrNull(sample.mmPerPx) ??
    numberOrNull(sample.mm_per_px) ??
    null;
  if (mmPerPx && mmPerPx > 0) {
    return 1 / mmPerPx;
  }

  const widthPx =
    numberOrNull(sample.px) ??
    numberOrNull(sample.pixels) ??
    numberOrNull(sample.widthPx) ??
    numberOrNull(sample.width_px) ??
    null;
  const widthMm =
    numberOrNull(sample.mm) ??
    numberOrNull(sample.millimeters) ??
    numberOrNull(sample.widthMm) ??
    numberOrNull(sample.width_mm) ??
    null;
  if (widthPx && widthMm && widthMm > 0) {
    return widthPx / widthMm;
  }

  const heightPx =
    numberOrNull(sample.heightPx) ??
    numberOrNull(sample.height_px) ??
    null;
  const heightMm =
    numberOrNull(sample.heightMm) ??
    numberOrNull(sample.height_mm) ??
    null;
  if (heightPx && heightMm && heightMm > 0) {
    return heightPx / heightMm;
  }

  return null;
};

const dpiToPxPerMm = (dpi) => {
  const num = numberOrNull(dpi);
  if (!num || num <= 0) return null;
  return num / 25.4;
};

const gatherSamples = (meta) => {
  if (!meta) return [];
  const nodes = [];
  if (meta.scale) nodes.push(meta.scale);
  if (meta.reference) nodes.push(meta.reference);
  if (meta.calibration) nodes.push(meta.calibration);
  if (Array.isArray(meta.references)) nodes.push(...meta.references);
  if (Array.isArray(meta.calibrations)) nodes.push(...meta.calibrations);
  return nodes.flatMap((node) =>
    Array.isArray(node) ? node.filter(Boolean) : [node].filter(Boolean),
  );
};

const average = (values) => {
  if (!values.length) return null;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
};

export const DEFAULT_SCALE = {
  pxPerMm: DEFAULT_PX_PER_MM,
  source: 'fallback',
};

export const resolveScale = (meta = {}) => {
  if (typeof meta === 'number' && Number.isFinite(meta)) {
    return { pxPerMm: meta, source: 'direct' };
  }

  if (meta && typeof meta.pxPerMm === 'number' && meta.pxPerMm > 0) {
    return { pxPerMm: meta.pxPerMm, source: 'meta' };
  }

  const samples = gatherSamples(meta);
  const candidates = [];

  for (const sample of samples) {
    const pxPerMm = sampleToPxPerMm(sample);
    if (pxPerMm && pxPerMm > 0) {
      candidates.push(pxPerMm);
    }
  }

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

  if (!candidates.length) {
    return { ...DEFAULT_SCALE };
  }

  const pxPerMm = average(candidates);
  return {
    pxPerMm,
    source: candidates.length === 1 ? 'single' : 'average',
  };
};

export const resolvePxPerMm = (meta = {}) => resolveScale(meta).pxPerMm;

export { DEFAULT_PX_PER_MM };
