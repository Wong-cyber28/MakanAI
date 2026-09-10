import 'react-native-url-polyfill/auto';
import AsyncStorage from '@react-native-async-storage/async-storage';
import Constants from 'expo-constants';
import { createClient } from '@supabase/supabase-js';
import { Platform } from 'react-native';

const isWebPrerender = Platform.OS === 'web' && typeof window === 'undefined';

const authStorage = {
  getItem: (key: string) => {
    if (isWebPrerender) {
      return Promise.resolve(null);
    }
    return AsyncStorage.getItem(key);
  },
  setItem: (key: string, value: string) => {
    if (isWebPrerender) {
      return Promise.resolve();
    }
    return AsyncStorage.setItem(key, value);
  },
  removeItem: (key: string) => {
    if (isWebPrerender) {
      return Promise.resolve();
    }
    return AsyncStorage.removeItem(key);
  },
};

const extra = (Constants.expoConfig?.extra ?? {}) as {
  supabaseUrl?: string;
  supabaseAnonKey?: string;
};

export const SUPABASE_URL =
  process.env.EXPO_PUBLIC_SUPABASE_URL || extra.supabaseUrl || '';
export const SUPABASE_ANON_KEY =
  process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || extra.supabaseAnonKey || '';

if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
  throw new Error(
    '环境变量缺失: 请确保 EXPO_PUBLIC_SUPABASE_URL 和 EXPO_PUBLIC_SUPABASE_ANON_KEY 已正确设置。'
  );
}

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
  auth: {
    storage: authStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
});
