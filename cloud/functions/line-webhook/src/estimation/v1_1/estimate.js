import table from "./table_v1_1.json" assert { type:"json" };
// components: [{kind:"salad"|"rice"|"meat"|"fish"|"tofu", area_mm2:number, height_mm?:number}]
export function estimateNutrition(components = []) {
  let veg=0, pro=0, kcal=0, fib=0;
  for (const c of components) {
    const t = table[c.kind] || table.salad;
    const area = Math.max(0, c.area_mm2 || 0);
    const h = Math.max(0, c.height_mm ?? 20);            // 既定高さ(20mm)
    const vol_ml = (area * h) / 1000;                    // mm³→ml
    const g = vol_ml * t.density_g_per_ml;               // 重量
    if (c.kind === "salad") veg += g;
    pro  += g * (t.protein_per_100g/100);
    kcal += g * (t.kcal_per_100g/100);
    fib  += g * (t.fiber_per_100g/100);
  }
  return {
    vegetables_g: Math.round(veg),
    protein_g: Math.round(pro),
    calories_kcal: Math.round(kcal),
    fiber_g: Math.round(fib),
    confidence: 0.7
  };
}
