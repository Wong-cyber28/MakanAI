import { getCurrentUserId, nutritionStorageKey } from './session-user';

export type NutritionTargets = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export const DEFAULT_NUTRITION_TARGETS: NutritionTargets = {
  calories: 2000,
  protein: 100,
  carbs: 250,
  fat: 70,
};

function asPositiveNumber(value: unknown, fallback: number) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

export function parseNutritionTargets(raw: string | null): NutritionTargets {
  if (!raw) {
    return { ...DEFAULT_NUTRITION_TARGETS };
  }

  try {
    const parsed = JSON.parse(raw) as Partial<NutritionTargets>;
    return {
      calories: Math.round(asPositiveNumber(parsed.calories, DEFAULT_NUTRITION_TARGETS.calories)),
      protein: Math.round(asPositiveNumber(parsed.protein, DEFAULT_NUTRITION_TARGETS.protein)),
      carbs: Math.round(asPositiveNumber(parsed.carbs, DEFAULT_NUTRITION_TARGETS.carbs)),
      fat: Math.round(asPositiveNumber(parsed.fat, DEFAULT_NUTRITION_TARGETS.fat)),
    };
  } catch {
    return { ...DEFAULT_NUTRITION_TARGETS };
  }
}

async function getAsyncStorage() {
  try {
    const module = await import('@react-native-async-storage/async-storage');
    return module.default ?? null;
  } catch (error) {
    console.warn('AsyncStorage 暂不可用', error);
    return null;
  }
}

export async function loadNutritionTargets(): Promise<NutritionTargets> {
  try {
    const userId = await getCurrentUserId();
    const AsyncStorage = await getAsyncStorage();
    if (!AsyncStorage || !userId) {
      return { ...DEFAULT_NUTRITION_TARGETS };
    }

    const raw = await AsyncStorage.getItem(nutritionStorageKey(userId));
    return parseNutritionTargets(raw);
  } catch (error) {
    console.warn('读取营养目标失败，使用默认值', error);
    return { ...DEFAULT_NUTRITION_TARGETS };
  }
}

export async function saveNutritionTargets(targets: NutritionTargets): Promise<void> {
  const userId = await getCurrentUserId();
  const AsyncStorage = await getAsyncStorage();
  if (!AsyncStorage || !userId) {
    throw new Error('AsyncStorage 暂不可用，请使用已重新编译的开发客户端。');
  }

  await AsyncStorage.setItem(nutritionStorageKey(userId), JSON.stringify(targets));
}

export type Sex = 'male' | 'female';
export type Goal = 'cut' | 'maintain' | 'bulk';
export type ActivityLevel = 'Sedentary' | 'Light' | 'Moderate' | 'Active';
export type PrimaryGoal = 'Lose steadily' | 'Maintain' | 'Build muscle';

const ACTIVITY_FACTORS: Record<ActivityLevel, number> = {
  Sedentary: 1.2,
  Light: 1.375,
  Moderate: 1.55,
  Active: 1.725,
};

const GOAL_CALORIE_SHIFT: Record<PrimaryGoal, number> = {
  'Lose steadily': -400,
  Maintain: 0,
  'Build muscle': 300,
};

export function calculateNutritionPlan(input: {
  sex: Sex;
  age: number;
  heightCm: number;
  weightKg: number;
  goal?: Goal;
  activityLevel?: ActivityLevel;
  primaryGoal?: PrimaryGoal;
}): NutritionTargets {
  const { sex, age, heightCm, weightKg } = input;
  const bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + (sex === 'male' ? 5 : -161);
  const tdee = bmr * ACTIVITY_FACTORS[input.activityLevel ?? 'Moderate'];
  const goalShift =
    input.primaryGoal != null
      ? GOAL_CALORIE_SHIFT[input.primaryGoal]
      : input.goal === 'cut'
        ? -400
        : input.goal === 'bulk'
          ? 300
          : 0;
  const calories = Math.round(tdee + goalShift);
  const protein = Math.round((calories * 0.3) / 4);
  const carbs = Math.round((calories * 0.4) / 4);
  const fat = Math.round((calories * 0.3) / 9);

  return { calories, protein, carbs, fat };
}
