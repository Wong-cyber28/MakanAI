export type MealMacros = {
  protein: number;
  carbs: number;
  fat: number;
};

export type MealIngredient = {
  name: string;
  calories: number;
};

export type MealLog = {
  id?: string;
  user_id?: string;
  dish_name: string;
  total_calories: number;
  macros: MealMacros;
  ingredients?: MealIngredient[] | string | null;
  image_url?: string | null;
  created_at?: string;
};
