export function estimateScale(detected = []) {
  // detected: [{label:"fork"|"spoon"|"can"|"card"|"chopsticks"|"plate"|"cup", length_px:number, confidence?:number}]
  const mm = { chopsticks:230, fork:190, spoon:180, can:122, card:91, plate:230, cup:100 };
  const f = detected.find(o => mm[o.label]);
  if (!f) return { source:"none", object_size_mm:null, pixels:null, px_per_mm:1.0, confidence:0.3 };
  const pxPerMm = (f.length_px || 0) / mm[f.label];
  return { source:f.label, object_size_mm:mm[f.label], pixels:f.length_px||0, px_per_mm:pxPerMm||1.0, confidence:f.confidence ?? 0.7 };
}
