export type MealMacros = {
  protein: number;
  carbs: number;
  fat: number;
};

export function parseNonNegative(value: string) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return 0;
  }
  return parsed;
}

export function formatMacro(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  const rounded = Math.round(value * 10) / 10;
  return Number.isInteger(rounded) ? String(Math.round(rounded)) : rounded.toFixed(1);
}

export function hasNamedIngredients(rows: { name: string }[]) {
  return rows.some((row) => row.name.trim().length > 0);
}

export function namedIngredientCalories(rows: { name: string; calories: string }[]) {
  return rows.reduce((sum, row) => {
    if (!row.name.trim()) {
      return sum;
    }
    return sum + Math.round(parseNonNegative(row.calories));
  }, 0);
}

export function ratioFromMacros(macros: MealMacros, calories: number): MealMacros {
  if (!(calories > 0)) {
    return { protein: 0, carbs: 0, fat: 0 };
  }
  return {
    protein: macros.protein / calories,
    carbs: macros.carbs / calories,
    fat: macros.fat / calories,
  };
}

export function scaleMacros(ratio: MealMacros, calories: number): MealMacros {
  return {
    protein: ratio.protein * calories,
    carbs: ratio.carbs * calories,
    fat: ratio.fat * calories,
  };
}

export function reconcileMacrosToCalories(macros: MealMacros, calories: number): MealMacros {
  const protein = Math.max(0, macros.protein);
  const carbs = Math.max(0, macros.carbs);
  const fat = (calories - protein * 4 - carbs * 4) / 9;
  if (fat >= 0) {
    return {
      protein,
      carbs,
      fat: Math.round(fat * 10) / 10,
    };
  }

  const nextCarbs = (calories - protein * 4) / 4;
  return {
    protein,
    carbs: Math.max(0, Math.round(nextCarbs * 10) / 10),
    fat: 0,
  };
}
