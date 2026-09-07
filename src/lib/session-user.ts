import { supabase } from './supabase';

export async function getCurrentUserId(): Promise<string | null> {
  const { data } = await supabase.auth.getSession();
  return data.session?.user?.id ?? null;
}

export function profileStorageKey(userId: string) {
  return `@user_profile:${userId}`;
}

export function nutritionStorageKey(userId: string) {
  return `@user_nutrition_targets:${userId}`;
}

export async function clearLocalUserData(userId: string): Promise<void> {
  const AsyncStorage = (await import('@react-native-async-storage/async-storage')).default;
  await AsyncStorage.multiRemove([profileStorageKey(userId), nutritionStorageKey(userId)]);
}
