import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetScrollView,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { Image } from 'expo-image';
import { useFocusEffect } from 'expo-router';
import * as Sharing from 'expo-sharing';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Alert,
  Platform,
  Pressable,
  SectionList,
  StyleSheet,
  Text,
  View,
  type ImageStyle,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import ViewShot, { type ViewShotRef } from 'react-native-view-shot';

import { PANDAN, WARM_BEIGE } from '@/constants/brand';
import { useUploadTask } from '@/context/UploadTaskContext';
import { DEFAULT_NUTRITION_TARGETS, loadNutritionTargets } from '@/lib/nutrition-targets';
import i18n, { getDateLocale } from '@/locales/i18n';
import { supabase } from '../../supabase';
import type { MealIngredient, MealLog } from '../../types/supabase';


const CARD_SHADOW = {
  shadowColor: '#1C1916',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.05,
  shadowRadius: 18,
  elevation: 2,
} as const;

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function getDayBounds(date: Date) {
  const start = startOfLocalDay(date);
  const next = new Date(start);
  next.setDate(next.getDate() + 1);
  return { start: start.toISOString(), end: next.toISOString() };
}

function shiftDay(date: Date, delta: number) {
  const next = startOfLocalDay(date);
  next.setDate(next.getDate() + delta);
  return next;
}

function isSameLocalDay(a: Date, b: Date) {
  return localDayStamp(a) === localDayStamp(b);
}

function formatHomeDateLabel(date: Date) {
  const today = startOfLocalDay(new Date());
  if (isSameLocalDay(date, today)) {
    return i18n.t('today');
  }
  if (isSameLocalDay(date, shiftDay(today, -1))) {
    return i18n.t('yesterday');
  }
  return date.toLocaleDateString(getDateLocale(), { month: 'short', day: 'numeric' });
}

function localDayStamp(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function dateKeyFromCreatedAt(iso?: string | null) {
  if (!iso) {
    return localDayStamp(new Date());
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return localDayStamp(new Date());
  }

  return localDayStamp(date);
}

function formatSectionTitle(dayKey: string) {
  const today = localDayStamp(new Date());
  const yesterdayDate = new Date();
  yesterdayDate.setDate(yesterdayDate.getDate() - 1);
  const yesterday = localDayStamp(yesterdayDate);

  if (dayKey === today) {
    return i18n.t('today');
  }
  if (dayKey === yesterday) {
    return i18n.t('yesterday');
  }

  const parts = dayKey.split('-');
  const year = Number(parts[0]);
  const month = Number(parts[1]);
  const day = Number(parts[2]);
  if (!year || !month || !day) {
    return dayKey;
  }

  return new Date(year, month - 1, day).toLocaleDateString(getDateLocale(), {
    month: 'short',
    day: 'numeric',
  });
}

function groupByDate(meals: MealLog[]): { title: string; data: MealLog[] }[] {
  const groups = new Map<string, MealLog[]>();

  for (const meal of meals) {
    const key = dateKeyFromCreatedAt(meal.created_at);
    const bucket = groups.get(key) ?? [];
    bucket.push(meal);
    groups.set(key, bucket);
  }

  return Array.from(groups.entries()).map(([key, data]) => ({
    title: formatSectionTitle(key),
    data,
  }));
}

function padTime(value: number) {
  return String(value).padStart(2, '0');
}

function formatLogTime(iso?: string | null): string {
  if (!iso) {
    return '';
  }

  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return '';
  }

  let hours = date.getHours();
  const suffix = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) {
    hours = 12;
  }

  return `${padTime(hours)}:${padTime(date.getMinutes())} ${suffix}`;
}

function formatGrams(value: number): string {
  if (!Number.isFinite(value)) {
    return '0';
  }
  return Number.isInteger(value) ? String(Math.round(value)) : value.toFixed(1);
}

function progressRatio(current: number, target: number) {
  if (target <= 0) {
    return 0;
  }
  return Math.min(Math.max(current, 0) / target, 1);
}

function readMacros(macros: MealLog['macros'] | string | null | undefined) {
  try {
    const parsed =
      typeof macros === 'string'
        ? (JSON.parse(macros) as MealLog['macros'])
        : macros;

    return {
      protein: Number(parsed?.protein) || 0,
      carbs: Number(parsed?.carbs) || 0,
      fat: Number(parsed?.fat) || 0,
    };
  } catch {
    return { protein: 0, carbs: 0, fat: 0 };
  }
}

function readIngredients(meal: MealLog | null | undefined): MealIngredient[] {
  if (!meal) {
    return [];
  }

  const fromColumn = parseIngredientList(meal.ingredients);
  if (fromColumn.length > 0) {
    return fromColumn;
  }

  try {
    const macros =
      typeof meal.macros === 'string'
        ? (JSON.parse(meal.macros) as { ingredients?: unknown })
        : (meal.macros as { ingredients?: unknown } | null | undefined);
    return parseIngredientList(macros?.ingredients);
  } catch {
    return [];
  }
}

function parseIngredientList(value: unknown): MealIngredient[] {
  try {
    const raw = typeof value === 'string' ? JSON.parse(value) : value;
    if (!Array.isArray(raw)) {
      return [];
    }

    const items: MealIngredient[] = [];
    for (const entry of raw) {
      if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) {
        continue;
      }

      const row = entry as { name?: unknown; calories?: unknown };
      const name = typeof row.name === 'string' ? row.name.trim() : '';
      if (!name) {
        continue;
      }

      const calories = Number(row.calories);
      items.push({
        name,
        calories: Number.isFinite(calories) ? Math.max(0, Math.round(calories)) : 0,
      });
    }

    return items;
  } catch {
    return [];
  }
}

const MEAL_COLUMNS =
  'id, dish_name, total_calories, macros, ingredients, image_url, created_at';
const MEAL_COLUMNS_FALLBACK = 'id, dish_name, total_calories, macros, image_url, created_at';

function missingIngredientsColumn(error: { message?: string; details?: string; hint?: string } | null) {
  if (!error) {
    return false;
  }
  return /ingredients/i.test(`${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`);
}

function mealPhotoUrl(value?: string | null) {
  if (typeof value !== 'string') {
    return null;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

function RingProgress({
  progress,
  size,
  color,
  trackColor,
  tickCount,
  tickWidth,
  tickHeight,
  children,
}: {
  progress: number;
  size: number;
  color: string;
  trackColor: string;
  tickCount: number;
  tickWidth: number;
  tickHeight: number;
  children?: ReactNode;
}) {
  const filled = Math.round(progressRatio(progress, 1) * tickCount);

  return (
    <View style={[styles.ringWrap, { width: size, height: size }]}>
      {Array.from({ length: tickCount }, (_, index) => (
        <View
          key={index}
          pointerEvents="none"
          style={[
            styles.ringTickSlot,
            {
              width: size,
              height: size,
              transform: [{ rotate: `${(index / tickCount) * 360}deg` }],
            },
          ]}>
          <View
            style={{
              width: tickWidth,
              height: tickHeight,
              borderRadius: tickWidth,
              backgroundColor: index < filled ? color : trackColor,
            }}
          />
        </View>
      ))}
      <View style={styles.ringCenter}>{children}</View>
    </View>
  );
}

function MealPhoto({
  uri,
  imageStyle,
  fallbackStyle,
}: {
  uri: string | null;
  imageStyle: StyleProp<ImageStyle>;
  fallbackStyle: StyleProp<ViewStyle>;
}) {
  const [failed, setFailed] = useState(false);

  if (!uri || failed) {
    return <View style={fallbackStyle} />;
  }

  return (
    <Image
      source={{ uri }}
      style={imageStyle}
      contentFit="cover"
      transition={200}
      onError={() => setFailed(true)}
    />
  );
}

function MacroMiniCard({
  grams,
  targetGrams,
  label,
  icon,
  progress,
  color,
}: {
  grams: number;
  targetGrams: number;
  label: string;
  icon: string;
  progress: number;
  color: string;
}) {
  return (
    <View style={styles.macroCard}>
      <View style={styles.macroValueRow}>
        <Text style={styles.macroGrams}>{Math.round(grams)}</Text>
        <Text style={styles.macroTarget}> / {Math.round(targetGrams)}g</Text>
      </View>
      <Text style={styles.macroName}>{label}</Text>
      <View style={styles.macroRingSlot}>
        <RingProgress
          progress={progress}
          size={44}
          color={color}
          trackColor="#EFEAE3"
          tickCount={24}
          tickWidth={2.5}
          tickHeight={5}>
          <Text style={styles.macroRingIcon}>{icon}</Text>
        </RingProgress>
      </View>
    </View>
  );
}

export default function HomeScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [recordedDays, setRecordedDays] = useState(0);
  const [todayCalories, setTodayCalories] = useState(0);
  const [todayProtein, setTodayProtein] = useState(0);
  const [todayCarbs, setTodayCarbs] = useState(0);
  const [todayFat, setTodayFat] = useState(0);
  const [meals, setMeals] = useState<MealLog[]>([]);
  const [targets, setTargets] = useState(DEFAULT_NUTRITION_TARGETS);
  const [selectedMeal, setSelectedMeal] = useState<MealLog | null>(null);
  const [selectedDate, setSelectedDate] = useState(() => startOfLocalDay(new Date()));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [isFetching, setIsFetching] = useState(true);
  const [refreshKey, setRefreshKey] = useState(0);
  const mealSheetRef = useRef<BottomSheetModal>(null);
  const viewShotRef = useRef<ViewShotRef>(null);
  const wasProcessingRef = useRef(false);
  const { isProcessing, processProgress, processingImage } = useUploadTask();
  const snapPoints = useMemo(() => ['50%', '90%'], []);

  const handleSheetChange = useCallback((index: number) => {
    if (index === -1) {
      setSelectedMeal(null);
    }
  }, []);

  const renderBackdrop = useCallback(
    (props: BottomSheetBackdropProps) => (
      <BottomSheetBackdrop
        {...props}
        appearsOnIndex={0}
        disappearsOnIndex={-1}
        opacity={0.4}
        pressBehavior="close"
      />
    ),
    []
  );

  const openMealDetails = useCallback((meal: MealLog) => {
    setSelectedMeal(meal);
    requestAnimationFrame(() => {
      mealSheetRef.current?.present();
    });
  }, []);

  const handleFixResults = useCallback(() => {
    console.log('触发重新分析');
  }, []);

  const handleShareMeal = useCallback(async () => {
    try {
      const capture = viewShotRef.current?.capture;
      if (!capture) {
        return;
      }

      const uri = await capture();
      const canShare = await Sharing.isAvailableAsync();
      if (!canShare) {
        Alert.alert(t('shareUnavailable'), t('shareUnavailable'));
        return;
      }

      await Sharing.shareAsync(uri, {
        dialogTitle: t('share'),
        mimeType: 'image/jpeg',
        UTI: 'public.jpeg',
      });
    } catch (error) {
      console.error('分享失败', error);
      Alert.alert(t('shareFailed'), t('shareFailed'));
    }
  }, [t]);

  const commitSelectedDate = useCallback((next: Date) => {
    const today = startOfLocalDay(new Date());
    const clamped = startOfLocalDay(next) > today ? today : startOfLocalDay(next);
    setIsFetching(true);
    setSelectedDate(clamped);
  }, []);

  const goToPreviousDay = useCallback(() => {
    commitSelectedDate(shiftDay(selectedDate, -1));
  }, [commitSelectedDate, selectedDate]);

  const goToNextDay = useCallback(() => {
    if (isSameLocalDay(selectedDate, new Date())) {
      return;
    }
    commitSelectedDate(shiftDay(selectedDate, 1));
  }, [commitSelectedDate, selectedDate]);

  const openDatePicker = useCallback(() => {
    setShowDatePicker(true);
  }, []);

  const handleHomeDateChange = useCallback(
    (event: DateTimePickerEvent, nextDate?: Date) => {
      if (event.type === 'dismissed') {
        setShowDatePicker(false);
        return;
      }

      if (nextDate) {
        commitSelectedDate(nextDate);
      }

      if (Platform.OS === 'android' && event.type === 'set') {
        setShowDatePicker(false);
      }
    },
    [commitSelectedDate]
  );

  useEffect(() => {
    if (wasProcessingRef.current && !isProcessing) {
      setRefreshKey((current) => current + 1);
    }
    wasProcessingRef.current = isProcessing;
  }, [isProcessing]);

  useFocusEffect(
    useCallback(() => {
      let ignore = false;
      setIsFetching(true);

      void (async () => {
        const { start, end } = getDayBounds(selectedDate);
        const nextTargets = await loadNutritionTargets();
        if (ignore) {
          return;
        }
        setTargets(nextTargets);

        const [dayResult, daysResult] = await Promise.all([
          supabase
            .from('meal_logs')
            .select(MEAL_COLUMNS)
            .gte('created_at', start)
            .lt('created_at', end)
            .order('created_at', { ascending: false }),
          supabase.from('meal_logs').select('created_at'),
        ]);

        if (ignore) {
          return;
        }

        const dayRows =
          dayResult.error && missingIngredientsColumn(dayResult.error)
            ? await supabase
                .from('meal_logs')
                .select(MEAL_COLUMNS_FALLBACK)
                .gte('created_at', start)
                .lt('created_at', end)
                .order('created_at', { ascending: false })
            : dayResult;

        if (ignore) {
          return;
        }

        if (dayRows.error) {
          console.error('读取当日餐食失败', dayRows.error);
        } else {
          const rows = (dayRows.data ?? []) as MealLog[];
          setTodayCalories(rows.reduce((sum, row) => sum + (Number(row.total_calories) || 0), 0));
          setTodayProtein(rows.reduce((sum, row) => sum + readMacros(row.macros).protein, 0));
          setTodayCarbs(rows.reduce((sum, row) => sum + readMacros(row.macros).carbs, 0));
          setTodayFat(rows.reduce((sum, row) => sum + readMacros(row.macros).fat, 0));
          setMeals(rows);
        }

        if (daysResult.error) {
          console.error('读取记录天数失败', daysResult.error);
        } else {
          const days = new Set(
            (daysResult.data ?? []).map((row) => dateKeyFromCreatedAt(String(row.created_at)))
          );
          setRecordedDays(days.size);
        }

        if (!ignore) {
          setIsFetching(false);
        }
      })();

      return () => {
        ignore = true;
      };
    }, [refreshKey, selectedDate])
  );

  const selectedMacros = selectedMeal ? readMacros(selectedMeal.macros) : null;
  const selectedCalories = selectedMeal
    ? Math.round(Number(selectedMeal.total_calories) || 0)
    : 0;
  const selectedIngredients = readIngredients(selectedMeal);
  const mealSections = useMemo(() => groupByDate(meals), [meals, t]);
  const viewingToday = isSameLocalDay(selectedDate, new Date());
  const canGoForward = !viewingToday;

  return (
    <View style={styles.screen}>
      <StatusBar style="dark" />
      <SectionList
        style={styles.list}
        sections={isFetching ? [] : mealSections}
        keyExtractor={(item, index) => item.id ?? `${item.created_at}-${index}`}
        contentContainerStyle={[
          styles.listContent,
          {
            paddingTop: insets.top + 16,
            paddingBottom: 32,
            flexGrow: 1,
          },
        ]}
        showsVerticalScrollIndicator={false}
        stickySectionHeadersEnabled={false}
        ListHeaderComponent={
          <View>
            <View style={styles.dateNav}>
              <Pressable
                onPress={goToPreviousDay}
                hitSlop={12}
                style={({ pressed }) => [styles.dateNavArrow, pressed && styles.pressed]}>
                <Text style={styles.dateNavArrowText}>‹</Text>
              </Pressable>
              <Pressable
                onPress={openDatePicker}
                style={({ pressed }) => [styles.dateNavCenter, pressed && styles.pressed]}>
                <Text style={styles.dateNavLabel}>{formatHomeDateLabel(selectedDate)}</Text>
              </Pressable>
              <Pressable
                disabled={!canGoForward}
                onPress={goToNextDay}
                hitSlop={12}
                style={({ pressed }) => [styles.dateNavArrow, pressed && styles.pressed]}>
                <Text style={[styles.dateNavArrowText, !canGoForward && styles.dateNavArrowMuted]}>
                  ›
                </Text>
              </Pressable>
            </View>
            <Text style={styles.daysLabel}>{t('recordedDays', { count: recordedDays })}</Text>

            <View style={styles.calorieCard}>
              <View style={styles.calorieCopy}>
                <Text style={styles.calorieValue}>{Math.round(todayCalories)}</Text>
                <Text style={styles.calorieTarget}>/ {Math.round(targets.calories)} kcal</Text>
              </View>
              <RingProgress
                progress={progressRatio(todayCalories, targets.calories)}
                size={96}
                color={PANDAN}
                trackColor="#E8E2D8"
                tickCount={40}
                tickWidth={3}
                tickHeight={8}>
                <Text style={styles.calorieRingIcon}>🔥</Text>
              </RingProgress>
            </View>

            <View style={styles.macroGrid}>
              <MacroMiniCard
                grams={todayProtein}
                targetGrams={targets.protein}
                label={t('protein')}
                icon="🍖"
                progress={progressRatio(todayProtein, targets.protein)}
                color="#6E7F73"
              />
              <MacroMiniCard
                grams={todayCarbs}
                targetGrams={targets.carbs}
                label={t('carbs')}
                icon="🌾"
                progress={progressRatio(todayCarbs, targets.carbs)}
                color="#C4A574"
              />
              <MacroMiniCard
                grams={todayFat}
                targetGrams={targets.fat}
                label={t('fats')}
                icon="🥑"
                progress={progressRatio(todayFat, targets.fat)}
                color="#8FA08A"
              />
            </View>

            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>
                {viewingToday ? `${t('recentMeals')} ` : `${formatHomeDateLabel(selectedDate)} `}
              </Text>
              <Text style={styles.sectionTitleMuted}>
                {viewingToday ? t('recentlyUploaded') : t('thisDay')}
              </Text>
            </View>

            {viewingToday && isProcessing ? (
              <View style={styles.processingCard}>
                <View style={styles.processingPhotoWrap}>
                  {processingImage ? (
                    <Image
                      source={{ uri: processingImage }}
                      style={styles.processingPhoto}
                      contentFit="cover"
                    />
                  ) : (
                    <View style={styles.processingPhotoFallback} />
                  )}
                  <View style={styles.processingPhotoMask} />
                </View>

                <View style={styles.processingBody}>
                  <Text style={styles.processingTitle}>{t('analyzingMeal')}</Text>
                  <View style={styles.processingTrack}>
                    <View
                      style={[
                        styles.processingFill,
                        { width: `${Math.min(Math.max(processProgress, 0), 100)}%` },
                      ]}
                    />
                  </View>
                  <Text style={styles.processingPercent}>{Math.round(processProgress)}%</Text>
                </View>
              </View>
            ) : null}
          </View>
        }
        renderSectionHeader={({ section }) => (
          <Text style={styles.dateHeader}>{section.title}</Text>
        )}
        renderItem={({ item }) => {
          const macros = readMacros(item.macros);

          return (
            <Pressable
              onPress={() => openMealDetails(item)}
              style={({ pressed }) => [styles.mealCard, pressed && styles.pressed]}>
              <View style={styles.mealPhotoWrap}>
                <MealPhoto
                  uri={mealPhotoUrl(item.image_url)}
                  imageStyle={styles.mealPhoto}
                  fallbackStyle={styles.mealPhotoFallback}
                />
              </View>

              <View style={styles.mealBody}>
                <View style={styles.mealTopRow}>
                  <Text style={styles.mealName} numberOfLines={1}>
                    {item.dish_name}
                  </Text>
                  <Text style={styles.mealTime}>{formatLogTime(item.created_at)}</Text>
                </View>

                <View style={styles.mealCalorieRow}>
                  <Text style={styles.mealCalorieIcon}>🔥</Text>
                  <Text style={styles.mealCalories}>
                    {Math.round(Number(item.total_calories) || 0)}
                  </Text>
                </View>

                <View style={styles.mealMacroRow}>
                  <Text style={styles.mealMacroChip}>🍖 {formatGrams(macros.protein)}g</Text>
                  <Text style={styles.mealMacroChip}>🌾 {formatGrams(macros.carbs)}g</Text>
                  <Text style={styles.mealMacroChip}>🥑 {formatGrams(macros.fat)}g</Text>
                </View>
              </View>
            </Pressable>
          );
        }}
        ListEmptyComponent={
          isFetching ? (
            <View>
              {[0, 1, 2].map((slot) => (
                <View key={slot} style={styles.mealCard}>
                  <View style={[styles.mealPhotoWrap, styles.skeletonBlock]} />
                  <View style={styles.skeletonCopy}>
                    <View style={styles.skeletonLineWide} />
                    <View style={styles.skeletonLine} />
                    <View style={styles.skeletonChips} />
                  </View>
                </View>
              ))}
            </View>
          ) : viewingToday && isProcessing ? null : (
            <View style={styles.emptyWrap}>
              <View style={styles.emptyCard}>
                <Text style={styles.emptyIcon}>🍽️</Text>
                <Text style={styles.emptyText}>
                  {t('noMealsLogged')}
                </Text>
              </View>
            </View>
          )
        }
      />

      <BottomSheetModal
        ref={mealSheetRef}
        snapPoints={snapPoints}
        enableDynamicSizing={false}
        enablePanDownToClose
        onChange={handleSheetChange}
        onDismiss={() => setSelectedMeal(null)}
        backdropComponent={renderBackdrop}
        backgroundStyle={styles.sheetBackground}
        handleIndicatorStyle={styles.sheetHandle}>
        <BottomSheetScrollView
          contentContainerStyle={[
            styles.sheetScrollContent,
            { paddingBottom: Math.max(insets.bottom, 20) + 8 },
          ]}
          showsVerticalScrollIndicator={false}>
          {selectedMeal && selectedMacros ? (
            <>
              {/* @ts-ignore */}
              <ViewShot
                ref={viewShotRef}
                // @ts-ignore
                collapsable={false}
                options={{ format: 'jpg', quality: 0.9 }}
                style={styles.shareCard}>
                <View style={styles.shareCardPhotoWrap}>
                  <MealPhoto
                    uri={mealPhotoUrl(selectedMeal.image_url)}
                    imageStyle={styles.sheetPhoto}
                    fallbackStyle={styles.sheetPhotoFallback}
                  />
                </View>

                <View style={styles.shareCardBody}>
                  <Text style={styles.sheetTitle}>{selectedMeal.dish_name}</Text>
                  <Text style={styles.sheetTime}>{formatLogTime(selectedMeal.created_at)}</Text>

                  <View style={styles.sheetCapsuleRow}>
                    <View style={styles.sheetCapsule}>
                      <Text style={styles.sheetCapsuleText}>
                        🍖 {formatGrams(selectedMacros.protein)}g
                      </Text>
                    </View>
                    <View style={styles.sheetCapsule}>
                      <Text style={styles.sheetCapsuleText}>
                        🌾 {formatGrams(selectedMacros.carbs)}g
                      </Text>
                    </View>
                    <View style={styles.sheetCapsule}>
                      <Text style={styles.sheetCapsuleText}>
                        🥑 {formatGrams(selectedMacros.fat)}g
                      </Text>
                    </View>
                    <View style={styles.sheetCapsule}>
                      <Text style={styles.sheetCapsuleText}>🔥 {selectedCalories}</Text>
                    </View>
                  </View>

                  <Text style={styles.shareWatermark}>{t('recordedWithMakanAI')}</Text>
                </View>
              </ViewShot>

              <View style={styles.sheetBody}>
                {selectedIngredients.length > 0 ? (
                  <>
                    <Text style={styles.ingredientsHeading}>{t('ingredients')}</Text>
                    <View style={styles.ingredientList}>
                      {selectedIngredients.map((ingredient, index) => (
                        <View
                          key={`${ingredient.name}-${index}`}
                          style={[
                            styles.ingredientRow,
                            index === selectedIngredients.length - 1 && styles.ingredientRowLast,
                          ]}>
                          <Text style={styles.ingredientName} numberOfLines={1}>
                            {ingredient.name}
                          </Text>
                          <Text style={styles.ingredientCalories}>{ingredient.calories} cal</Text>
                        </View>
                      ))}
                    </View>
                  </>
                ) : null}

                <Pressable
                  onPress={handleFixResults}
                  style={({ pressed }) => [styles.secondaryButton, pressed && styles.pressed]}>
                  <Text style={styles.secondaryButtonText}>{t('fixResults')}</Text>
                </Pressable>
                <Pressable
                  onPress={() => {
                    void handleShareMeal();
                  }}
                  style={({ pressed }) => [styles.primaryButton, pressed && styles.pressed]}>
                  <Text style={styles.primaryButtonText}>📤 {t('share')}</Text>
                </Pressable>
              </View>
            </>
          ) : null}
        </BottomSheetScrollView>
      </BottomSheetModal>

      {showDatePicker ? (
        Platform.OS === 'ios' ? (
          <View style={[styles.iosPickerSheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.iosPickerToolbar}>
              <Pressable onPress={() => setShowDatePicker(false)} hitSlop={12}>
                <Text style={styles.iosPickerDone}>{t('done')}</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={selectedDate}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              onChange={handleHomeDateChange}
            />
          </View>
        ) : (
          <DateTimePicker
            value={selectedDate}
            mode="date"
            display="spinner"
            maximumDate={new Date()}
            onChange={handleHomeDateChange}
          />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: WARM_BEIGE,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
  },
  dateNav: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 10,
    paddingVertical: 8,
    marginBottom: 12,
    ...CARD_SHADOW,
  },
  dateNavArrow: {
    width: 40,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  dateNavArrowText: {
    color: PANDAN,
    fontSize: 28,
    lineHeight: 30,
  },
  dateNavArrowMuted: {
    color: '#E4DDD4',
  },
  dateNavCenter: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 4,
  },
  dateNavLabel: {
    color: '#2C2A26',
    fontSize: 16,
    fontWeight: '600',
  },
  iosPickerSheet: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
  },
  iosPickerToolbar: {
    alignItems: 'flex-end',
    paddingHorizontal: 20,
    paddingTop: 10,
  },
  iosPickerDone: {
    color: PANDAN,
    fontSize: 16,
    fontWeight: '600',
  },
  daysLabel: {
    color: '#8A847A',
    fontSize: 13,
    fontWeight: '500',
    marginBottom: 14,
  },
  calorieCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingVertical: 22,
    paddingHorizontal: 22,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
    ...CARD_SHADOW,
  },
  calorieCopy: {
    flex: 1,
    paddingRight: 12,
  },
  calorieValue: {
    color: '#2C2A26',
    fontSize: 56,
    fontWeight: '300',
    letterSpacing: -2,
    lineHeight: 60,
  },
  calorieTarget: {
    color: '#9A958C',
    fontSize: 15,
    marginTop: 4,
  },
  calorieRingIcon: {
    fontSize: 22,
  },
  ringWrap: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  ringTickSlot: {
    position: 'absolute',
    alignItems: 'center',
  },
  ringCenter: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  macroGrid: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 28,
  },
  macroCard: {
    flex: 1,
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingTop: 16,
    paddingBottom: 14,
    paddingHorizontal: 8,
    alignItems: 'center',
    ...CARD_SHADOW,
  },
  macroValueRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    flexWrap: 'wrap',
    maxWidth: '100%',
  },
  macroGrams: {
    color: '#2C2A26',
    fontSize: 22,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  macroTarget: {
    color: '#B0AAA2',
    fontSize: 11,
    fontWeight: '500',
  },
  macroName: {
    color: '#9A958C',
    fontSize: 11,
    marginTop: 2,
    marginBottom: 10,
  },
  macroRingSlot: {
    marginTop: 2,
  },
  macroRingIcon: {
    fontSize: 13,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'baseline',
    flexWrap: 'wrap',
    marginBottom: 12,
  },
  sectionTitle: {
    color: '#2C2A26',
    fontSize: 20,
    fontWeight: '700',
  },
  sectionTitleMuted: {
    color: '#9A958C',
    fontSize: 15,
    fontWeight: '600',
  },
  dateHeader: {
    color: '#6B6560',
    fontSize: 14,
    fontWeight: '600',
    paddingTop: 18,
    paddingBottom: 10,
  },
  mealCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 10,
    ...CARD_SHADOW,
  },
  processingCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    marginBottom: 10,
    ...CARD_SHADOW,
  },
  processingPhotoWrap: {
    width: 80,
    height: 80,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#EDE6DC',
  },
  processingPhoto: {
    width: 80,
    height: 80,
    opacity: 0.72,
  },
  processingPhotoFallback: {
    width: 80,
    height: 80,
    backgroundColor: '#EDE6DC',
  },
  processingPhotoMask: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(28, 24, 20, 0.38)',
  },
  processingBody: {
    flex: 1,
    minWidth: 0,
  },
  processingTitle: {
    color: '#2C2A26',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  processingTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: '#EFEAE3',
    overflow: 'hidden',
    marginBottom: 8,
  },
  processingFill: {
    height: '100%',
    borderRadius: 999,
    backgroundColor: PANDAN,
  },
  processingPercent: {
    color: '#9A958C',
    fontSize: 12,
  },
  mealPhotoWrap: {
    width: 80,
    height: 80,
    borderRadius: 16,
    overflow: 'hidden',
    backgroundColor: '#EDE6DC',
  },
  mealPhoto: {
    width: 80,
    height: 80,
  },
  mealPhotoFallback: {
    width: 80,
    height: 80,
    backgroundColor: '#EDE6DC',
  },
  skeletonBlock: {
    backgroundColor: '#EDE6DC',
  },
  skeletonCopy: {
    flex: 1,
    gap: 8,
  },
  skeletonLineWide: {
    height: 14,
    width: '72%',
    borderRadius: 8,
    backgroundColor: '#EDE6DC',
  },
  skeletonLine: {
    height: 12,
    width: '40%',
    borderRadius: 8,
    backgroundColor: '#EFEAE3',
  },
  skeletonChips: {
    height: 18,
    width: '88%',
    borderRadius: 8,
    backgroundColor: '#EFEAE3',
    marginTop: 4,
  },
  mealBody: {
    flex: 1,
    minWidth: 0,
  },
  mealTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 6,
  },
  mealName: {
    flex: 1,
    color: '#2C2A26',
    fontSize: 16,
    fontWeight: '600',
  },
  mealTime: {
    color: '#9A958C',
    fontSize: 12,
  },
  mealCalorieRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 8,
  },
  mealCalorieIcon: {
    fontSize: 12,
  },
  mealCalories: {
    color: '#2C2A26',
    fontSize: 15,
    fontWeight: '600',
  },
  mealMacroRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  mealMacroChip: {
    color: '#8A847A',
    fontSize: 11,
    backgroundColor: '#F6F1EA',
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 7,
    paddingVertical: 3,
  },
  emptyWrap: {
    flexGrow: 1,
    minHeight: 220,
    justifyContent: 'center',
  },
  emptyCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 24,
    paddingHorizontal: 28,
    paddingVertical: 32,
    alignItems: 'center',
    ...CARD_SHADOW,
  },
  emptyIcon: {
    fontSize: 36,
    marginBottom: 12,
    opacity: 0.72,
  },
  emptyText: {
    color: '#9A958C',
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.82,
  },
  sheetBackground: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  sheetHandle: {
    width: 40,
    backgroundColor: '#E4DDD4',
  },
  sheetScrollContent: {
    paddingBottom: 8,
    paddingTop: 4,
  },
  shareCard: {
    marginHorizontal: 16,
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    padding: 14,
    overflow: 'hidden',
  },
  shareCardPhotoWrap: {
    overflow: 'hidden',
    borderRadius: 16,
    backgroundColor: '#EDE6DC',
  },
  shareCardBody: {
    paddingTop: 16,
    paddingHorizontal: 4,
    paddingBottom: 6,
  },
  shareWatermark: {
    color: '#C4BEB5',
    fontSize: 11,
    letterSpacing: 0.2,
    marginTop: 8,
    textAlign: 'center',
  },
  sheetPhoto: {
    width: '100%',
    height: 188,
  },
  sheetPhotoFallback: {
    width: '100%',
    height: 188,
    backgroundColor: '#EDE6DC',
  },
  sheetBody: {
    paddingHorizontal: 20,
    paddingTop: 22,
  },
  sheetTime: {
    color: '#9A958C',
    fontSize: 13,
    marginBottom: 16,
  },
  sheetTitle: {
    color: '#2C2A26',
    fontSize: 26,
    fontWeight: '600',
    lineHeight: 32,
    marginBottom: 6,
  },
  sheetCapsuleRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 14,
  },
  sheetCapsule: {
    backgroundColor: '#F6F1EA',
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  sheetCapsuleText: {
    color: '#6B6560',
    fontSize: 13,
    fontWeight: '500',
  },
  ingredientsHeading: {
    color: '#2C2A26',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  ingredientList: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    marginBottom: 24,
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: '#EDE6DC',
  },
  ingredientRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1ECE4',
  },
  ingredientRowLast: {
    borderBottomWidth: 0,
  },
  ingredientName: {
    flex: 1,
    color: '#2C2A26',
    fontSize: 15,
  },
  ingredientCalories: {
    color: '#8A847A',
    fontSize: 14,
  },
  secondaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: '#F3EEE6',
    marginBottom: 10,
  },
  secondaryButtonText: {
    color: '#2C2A26',
    fontSize: 16,
    fontWeight: '600',
  },
  primaryButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 999,
    backgroundColor: PANDAN,
  },
  primaryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
