import { inferTags as inferMealTags } from '../meals.js';

export function inferTags(ingredients: readonly string[] = []): string[] {
  return inferMealTags(ingredients);
}
