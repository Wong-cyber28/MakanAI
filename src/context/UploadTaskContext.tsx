import {
    createContext,
    useCallback,
    useContext,
    useEffect,
    useMemo,
    useRef,
    useState,
    type ReactNode,
} from 'react';
import { Alert, Platform } from 'react-native';

import i18n from '@/locales/i18n';
import { captureEvent } from '@/lib/analytics';
import type { MealIngredient, MealLog } from '../../types/supabase';
import { SUPABASE_ANON_KEY, SUPABASE_URL, supabase } from '../lib/supabase';
import { getCurrentUserId } from '@/lib/session-user';

const ANALYZE_URL = `${SUPABASE_URL.replace(/\/$/, '')}/functions/v1/analyze-meal`;
const MEAL_IMAGES_BUCKET = 'meal_images';

function mealImagePathFromUrl(imageUrl?: string | null): string | null {
  if (typeof imageUrl !== 'string' || !imageUrl.trim()) {
    return null;
  }

  try {
    const url = new URL(imageUrl.trim());
    const marker = `/object/public/${MEAL_IMAGES_BUCKET}/`;
    const index = url.pathname.indexOf(marker);
    if (index === -1) {
      return null;
    }

    const path = decodeURIComponent(url.pathname.slice(index + marker.length));
    return path.length > 0 ? path : null;
  } catch {
    return null;
  }
}

export async function removeMealImage(imageUrl?: string | null): Promise<void> {
  const path = mealImagePathFromUrl(imageUrl);
  if (!path) {
    return;
  }

  const { error } = await supabase.storage.from(MEAL_IMAGES_BUCKET).remove([path]);
  if (error) {
    console.warn('删除餐食图片失败', error);
  }
}

const GEMINI_OUTPUT_CONTRACT = `Output MUST be strictly valid JSON with these fields:
- isFood (boolean)
- dish_name (string)
- total_calories (number)
- protein (number, grams)
- carbs (number, grams)
- fats (number, grams)
- ingredients (array)

If the image is not edible food or drink (person, room, receipt, animal, scenery, random object), set isFood to false, dish_name to "No food detected", all numbers to 0, and ingredients to [].

Ingredient breakdown (CRITICAL):
If the food is a complex meal (e.g., a lunch tray, economy rice, burger meal), break down the main components into the "ingredients" array, where each object has "name" (string) and "calories" (number). If the food is a single item, a pre-packaged snack, or a beverage, the "ingredients" array MUST be completely empty ([]).`;

class NotFoodError extends Error {
  constructor() {
    super('No food detected');
    this.name = 'NotFoodError';
  }
}

class SessionChangedError extends Error {
  constructor() {
    super('Session changed');
    this.name = 'SessionChangedError';
  }
}

type MealAnalysis = {
  dish_name: string;
  total_calories: number;
  macros: {
    protein: number;
    carbs: number;
    fat: number;
  };
  ingredients: MealIngredient[];
};

export type ProcessMealOptions = {
  replaceMealId?: string;
  reuseImageUrl?: string;
};

export type UploadTaskContextValue = {
  isProcessing: boolean;
  processProgress: number;
  processingImage: string | null;
  startProcessingTask: (
    imageUri: string,
    base64Data: string,
    extraPrompt?: string,
    options?: ProcessMealOptions
  ) => Promise<void>;
};

const UploadTaskContext = createContext<UploadTaskContextValue | null>(null);

function uniqueMealImageName() {
  const suffix = Math.random().toString(36).slice(2, 10);
  return `${Date.now()}-${suffix}.jpg`;
}

function getErrorMessage(error: unknown): string {
  let raw = '';
  if (typeof error === 'object' && error && 'message' in error) {
    const message = (error as { message: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      raw = message;
    }
  } else if (error instanceof Error && error.message.trim()) {
    raw = error.message;
  }

  if (!raw) {
    return '请检查网络后再试一次。';
  }

  try {
    const parsed = JSON.parse(raw) as { message?: string };
    if (parsed.message?.trim()) {
      return parsed.message;
    }
  } catch {
    // Keep the original text when it is not JSON.
  }

  return raw;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function toFiniteNumber(value: unknown): number {
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === 'string' && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function parseIngredients(value: unknown): MealIngredient[] {
  try {
    const raw = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(raw)) {
      return [];
    }

    const items: MealIngredient[] = [];
    for (const entry of raw) {
      const row = asRecord(entry);
      if (!row) {
        continue;
      }

      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (!name) {
        continue;
      }

      items.push({
        name,
        calories: Math.max(0, Math.round(toFiniteNumber(row.calories))),
      });
    }

    return items;
  } catch {
    return [];
  }
}

function missingColumn(error: { message?: string; details?: string; code?: string } | null, column: string) {
  if (!error) {
    return false;
  }
  return new RegExp(column, 'i').test(`${error.message ?? ''} ${error.details ?? ''} ${error.code ?? ''}`);
}

function isNonFoodPayload(payload: unknown): boolean {
  const row = asRecord(payload);
  if (!row) {
    return false;
  }

  if (row.isFood === false || row.is_food === false) {
    return true;
  }

  const names = [row.dish_name, row.name]
    .filter((value): value is string => typeof value === 'string')
    .map((value) => value.trim().toLowerCase());

  return names.some(
    (name) =>
      name === 'no food detected' ||
      name.includes('no food') ||
      name.includes('not food') ||
      name.includes('not a food') ||
      name.includes('is not food')
  );
}

function normalizeMealAnalysis(payload: unknown): MealAnalysis {
  const row = asRecord(payload);
  if (!row) {
    throw new Error('没能识别这道菜，换个角度再拍一次吧。');
  }

  if (typeof row.error === 'string' && row.error.trim()) {
    throw new Error(row.error);
  }

  const macrosRow = asRecord(row.macros);
  const dishName = typeof row.dish_name === 'string' ? row.dish_name.trim() : '';
  if (!dishName) {
    throw new Error('没能识别这道菜，换个角度再拍一次吧。');
  }

  return {
    dish_name: dishName,
    total_calories: Math.max(0, toFiniteNumber(row.total_calories)),
    macros: {
      protein: Math.max(0, toFiniteNumber(row.protein ?? macrosRow?.protein)),
      carbs: Math.max(0, toFiniteNumber(row.carbs ?? macrosRow?.carbs)),
      fat: Math.max(0, toFiniteNumber(row.fats ?? row.fat ?? macrosRow?.fat ?? macrosRow?.fats)),
    },
    ingredients: parseIngredients(row.ingredients),
  };
}

function parseAnalyzePayload(rawText: string): unknown {
  const trimmed = rawText.trim();
  if (!trimmed) {
    throw new Error('分析返回是空的，请稍后再试。');
  }

  try {
    return JSON.parse(trimmed);
  } catch {
    const unfenced = trimmed.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
    try {
      return JSON.parse(unfenced);
    } catch {
      throw new Error('分析返回的数据无法解析。');
    }
  }
}

function cleanImageBase64(value: string): string {
  const trimmed = value.trim();
  const commaIndex = trimmed.indexOf(',');
  const withoutPrefix =
    trimmed.startsWith('data:') && commaIndex !== -1 ? trimmed.slice(commaIndex + 1) : trimmed;
  return withoutPrefix.replace(/\s/g, '');
}

function decodeBase64ToArrayBuffer(base64: string): ArrayBuffer {
  const cleaned = cleanImageBase64(base64);
  if (!cleaned) {
    throw new Error('照片数据是空的');
  }

  const padded = cleaned + '='.repeat((4 - (cleaned.length % 4)) % 4);
  const atobFn = globalThis.atob;
  if (typeof atobFn !== 'function') {
    throw new Error('当前环境无法解码照片');
  }

  const binary = atobFn(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i) & 255;
  }

  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
}

function uploadWithXhr(
  objectUrl: string,
  body: ArrayBuffer,
  anonKey: string,
  accessToken: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('POST', objectUrl);
    xhr.setRequestHeader('Authorization', `Bearer ${accessToken}`);
    xhr.setRequestHeader('apikey', anonKey);
    xhr.setRequestHeader('Content-Type', 'image/jpeg');
    xhr.setRequestHeader('x-upsert', 'false');
    xhr.setRequestHeader('cache-control', 'max-age=3600');
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
        return;
      }
      reject(new Error(xhr.responseText || `上传失败 (${xhr.status})`));
    };
    xhr.onerror = () => {
      reject(new Error('网络错误，照片没有上传'));
    };
    xhr.send(body);
  });
}

async function uploadMealImage(base64: string, userId: string, accessToken: string): Promise<string> {
  const fileName = `${userId}/${uniqueMealImageName()}`;
  const body = decodeBase64ToArrayBuffer(base64);

  if (body.byteLength < 32) {
    throw new Error('照片数据不完整，请重新拍摄');
  }

  const supabaseUrl = SUPABASE_URL;
  const anonKey = SUPABASE_ANON_KEY;
  if (!supabaseUrl || !anonKey) {
    throw new Error('缺少 Supabase 配置');
  }

  const objectUrl = `${supabaseUrl}/storage/v1/object/${MEAL_IMAGES_BUCKET}/${fileName}`;

  if (Platform.OS === 'web') {
    const { error } = await supabase.storage.from(MEAL_IMAGES_BUCKET).upload(fileName, body, {
      contentType: 'image/jpeg',
      cacheControl: '3600',
      upsert: false,
    });
    if (error) {
      throw error;
    }
  } else {
    try {
      await uploadWithXhr(objectUrl, body, anonKey, accessToken);
    } catch (xhrError) {
      console.warn('XHR 上传失败，改用 Supabase SDK', xhrError);
      const { error } = await supabase.storage.from(MEAL_IMAGES_BUCKET).upload(fileName, body, {
        contentType: 'image/jpeg',
        cacheControl: '3600',
        upsert: false,
      });
      if (error) {
        throw xhrError;
      }
    }
  }

  const { data: publicData } = supabase.storage.from(MEAL_IMAGES_BUCKET).getPublicUrl(fileName);
  if (!publicData.publicUrl) {
    throw new Error('未能获取图片链接');
  }

  return publicData.publicUrl;
}

async function analyzeMeal(base64Data: string, extraPrompt?: string): Promise<MealAnalysis> {
  const trimmedPrompt = extraPrompt?.trim() ?? '';
  const extraNote = trimmedPrompt
    ? `User added note: ${trimmedPrompt}. Please take this into account.`
    : '';
  const userContext = extraNote
    ? `${GEMINI_OUTPUT_CONTRACT}\n\n${extraNote}`
    : GEMINI_OUTPUT_CONTRACT;

  const {
    data: { session },
  } = await supabase.auth.getSession();
  if (!session?.access_token) {
    throw new Error('Please sign in before analyzing a meal.');
  }

  const anonKey = SUPABASE_ANON_KEY;
  const response = await fetch(ANALYZE_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${session.access_token}`,
      apikey: anonKey,
    },
    body: JSON.stringify({
      imageBase64: base64Data,
      userContext,
    }),
  });

  const rawText = await response.text();
  let payload: unknown;
  try {
    payload = parseAnalyzePayload(rawText);
  } catch (error) {
    if (!response.ok) {
      throw new Error('分析失败，请稍后再试。');
    }
    throw error;
  }

  const row = asRecord(payload);
  if (!response.ok || (typeof row?.error === 'string' && row.error.trim())) {
    throw new Error(
      (typeof row?.error === 'string' && row.error.trim()) || '分析失败，请稍后再试。'
    );
  }

  if (isNonFoodPayload(payload)) {
    throw new NotFoodError();
  }

  return normalizeMealAnalysis(payload);
}

export function UploadTaskProvider({ children }: { children: ReactNode }) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [processProgress, setProcessProgress] = useState(0);
  const [processingImage, setProcessingImage] = useState<string | null>(null);
  const runningRef = useRef(false);
  const mountedRef = useRef(true);
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearProgressTimer = useCallback(() => {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      clearProgressTimer();
    };
  }, [clearProgressTimer]);

  const assertSameUser = useCallback(async (startedAs: string) => {
    const currentId = await getCurrentUserId();
    if (!mountedRef.current || currentId !== startedAs) {
      throw new SessionChangedError();
    }
  }, []);

  const startProcessingTask = useCallback(
    async (imageUri: string, base64Data: string, extraPrompt?: string, options?: ProcessMealOptions) => {
      if (runningRef.current) {
        return;
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      const startedAs = session?.user?.id;
      const accessToken = session?.access_token;
      if (!startedAs || !accessToken) {
        Alert.alert(i18n.t('mealNotSaved'), 'Please sign in before saving a meal.');
        return;
      }

      runningRef.current = true;
      setIsProcessing(true);
      setProcessingImage(imageUri);
      setProcessProgress(6);

      const startedAt = Date.now();
      const isReplace = Boolean(options?.replaceMealId);
      const hasNote = Boolean(extraPrompt?.trim());
      captureEvent('meal_analyze_started', {
        is_replace: isReplace,
        has_note: hasNote,
      });

      progressTimerRef.current = setInterval(() => {
        setProcessProgress((current) => {
          if (current >= 80) {
            return 80;
          }
          return Math.min(80, current + 3);
        });
      }, 420);

      try {
        const analysis = await analyzeMeal(base64Data, extraPrompt);
        if (isNonFoodPayload(analysis) || analysis.dish_name.toLowerCase() === 'no food detected') {
          throw new NotFoodError();
        }

        await assertSameUser(startedAs);
        const reuseUrl = options?.reuseImageUrl?.startsWith('http') ? options.reuseImageUrl : '';
        const imageUrl = reuseUrl || (await uploadMealImage(base64Data, startedAs, accessToken));

        if (!imageUrl.startsWith('http')) {
          throw new Error('没有拿到有效的图片链接');
        }

        await assertSameUser(startedAs);

        const extraNote = extraPrompt?.trim() || null;
        const mealRow = {
          user_id: startedAs,
          dish_name: analysis.dish_name,
          total_calories: analysis.total_calories,
          macros: {
            protein: analysis.macros.protein,
            carbs: analysis.macros.carbs,
            fat: analysis.macros.fat,
          },
          ingredients: analysis.ingredients,
          extra_note: extraNote,
          image_url: imageUrl,
        } satisfies Pick<
          MealLog,
          'user_id' | 'dish_name' | 'total_calories' | 'macros' | 'ingredients' | 'extra_note' | 'image_url'
        >;

        const writeMeal = (row: Record<string, unknown>) =>
          options?.replaceMealId
            ? supabase.from('meal_logs').update(row).eq('id', options.replaceMealId).eq('user_id', startedAs)
            : supabase.from('meal_logs').insert(row);

        let { error } = await writeMeal(mealRow);

        if (missingColumn(error, 'extra_note')) {
          const { extra_note: _ignored, ...withoutNote } = mealRow;
          const fallback = await writeMeal({
            ...withoutNote,
            macros: {
              ...mealRow.macros,
              extra_note: extraNote,
            },
          });
          error = fallback.error;
        }

        if (missingColumn(error, 'ingredients')) {
          const { extra_note: _ignored, ingredients, ...rest } = mealRow;
          const fallback = await writeMeal({
            ...rest,
            macros: {
              ...mealRow.macros,
              ingredients,
              extra_note: extraNote,
            },
          });
          error = fallback.error;
        }

        if (error) {
          throw error;
        }

        await assertSameUser(startedAs);
        clearProgressTimer();
        if (mountedRef.current) {
          setProcessProgress(100);
        }
        captureEvent('meal_analyze_succeeded', {
          is_replace: isReplace,
          has_note: hasNote,
          duration_ms: Date.now() - startedAt,
        });
        if (isReplace) {
          captureEvent('meal_replaced', {
            has_note: hasNote,
            duration_ms: Date.now() - startedAt,
          });
        }
        await new Promise((resolve) => setTimeout(resolve, 420));
      } catch (error) {
        if (error instanceof SessionChangedError || !mountedRef.current) {
          return;
        }
        if (error instanceof NotFoodError) {
          captureEvent('meal_not_food', {
            is_replace: isReplace,
            has_note: hasNote,
            duration_ms: Date.now() - startedAt,
          });
          Alert.alert(i18n.t('notFoodTitle'), i18n.t('notFoodBody'), [{ text: i18n.t('gotIt') }]);
        } else {
          captureEvent('meal_analyze_failed', {
            is_replace: isReplace,
            has_note: hasNote,
            duration_ms: Date.now() - startedAt,
            error_type: error instanceof Error ? error.name : 'unknown',
          });
          console.error('后台处理餐食失败', error);
          Alert.alert(i18n.t('mealNotSaved'), getErrorMessage(error));
        }
      } finally {
        clearProgressTimer();
        runningRef.current = false;
        if (mountedRef.current) {
          setIsProcessing(false);
          setProcessingImage(null);
          setProcessProgress(0);
        }
      }
    },
    [assertSameUser, clearProgressTimer]
  );

  const value = useMemo(
    () => ({
      isProcessing,
      processProgress,
      processingImage,
      startProcessingTask,
    }),
    [isProcessing, processProgress, processingImage, startProcessingTask]
  );

  return <UploadTaskContext.Provider value={value}>{children}</UploadTaskContext.Provider>;
}

export function useUploadTask() {
  const value = useContext(UploadTaskContext);
  if (!value) {
    throw new Error('useUploadTask 必须在 UploadTaskProvider 内使用');
  }
  return value;
}
