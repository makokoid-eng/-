export function normalizeKind(raw = "") {
  const s = String(raw).toLowerCase();
  if (/(サラダ|野菜|レタス|大根|きゅうり|ﾌﾞﾛｯｺﾘｰ|ブロッコリー)/.test(s)) return "salad";
  if (/(ご飯|米|飯|白米|玄米|おにぎり|麺|そうめん|そば|うどん|パスタ)/.test(s)) return "rice";
  if (/(牛|豚|鶏|肉|ｶﾂ|唐揚)/.test(s)) return "meat";
  if (/(魚|鮭|サーモン|貝|あさり|しじみ|海鮮)/.test(s)) return "fish";
  if (/(豆腐|厚揚|納豆|卵|玉子)/.test(s)) return "tofu";
  if (/(味噌汁|スープ|汁)/.test(s)) return "soup"; // 栄養寄与少：計算から外す
  return "salad";
}
