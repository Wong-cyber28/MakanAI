import { useFocusEffect } from 'expo-router';
import { useCallback, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CARD_SHADOW } from '@/components/settings-ui';
import { PANDAN, WARM_BEIGE } from '@/constants/brand';
import { supabase } from '../../../supabase';

type ViewMode = 'week' | 'month';

type HistoryBar = {
  value: number;
  label: string;
  dateLabel: string;
  dateKey: string;
};

const WEEKDAY_LABELS = ['S', 'M', 'T', 'W', 'T', 'F', 'S'] as const;
const BAR_IDLE = '#C9C4BB';
const TOOLTIP_FILL = '#5D8B66';
const BAR_HEIGHT = 168;
const MONTH_LABEL_STEP = 6;
const HISTORY_DAYS = 30;
const WEEK_DAYS = 7;

function startOfLocalDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
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

function buildConsecutiveDates(end: Date, days: number) {
  const last = startOfLocalDay(end);
  const dates: Date[] = [];

  for (let offset = days - 1; offset >= 0; offset -= 1) {
    dates.push(shiftDays(last, -offset));
  }

  return dates;
}

function formatRangeEdge(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function formatTooltipDate(date: Date) {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function weekdayAbbrev(date: Date) {
  return WEEKDAY_LABELS[date.getDay()];
}

function safeCalories(value: number) {
  const next = Number(value);
  return Number.isFinite(next) && next > 0 ? next : 0;
}

function shiftDays(date: Date, delta: number) {
  const next = startOfLocalDay(date);
  next.setDate(next.getDate() + delta);
  return next;
}

function hideCrowdedLastLabel(bars: HistoryBar[]) {
  const lastIndex = bars.length - 1;
  if (lastIndex <= 0 || !bars[lastIndex].label) {
    return bars;
  }

  let previousLabelIndex = -1;
  for (let index = lastIndex - 1; index >= 0; index -= 1) {
    if (bars[index].label) {
      previousLabelIndex = index;
      break;
    }
  }

  if (previousLabelIndex >= 0 && lastIndex - previousLabelIndex < MONTH_LABEL_STEP) {
    return bars.map((bar, index) => (index === lastIndex ? { ...bar, label: '' } : bar));
  }

  return bars;
}

async function fetchAndProcessHistoryData() {
  const today = startOfLocalDay(new Date());
  const startDate = shiftDays(today, -(HISTORY_DAYS - 1));
  const consecutiveDates = buildConsecutiveDates(today, HISTORY_DAYS);

  const { data, error } = await supabase
    .from('meal_logs')
    .select('total_calories, created_at')
    .gte('created_at', startDate.toISOString());

  if (error) {
    throw error;
  }

  const totalsByDay = new Map<string, number>();
  for (const row of data ?? []) {
    const key = dateKeyFromCreatedAt(String(row.created_at));
    const current = totalsByDay.get(key) ?? 0;
    totalsByDay.set(key, current + safeCalories(Number(row.total_calories)));
  }

  const processedMonthData = hideCrowdedLastLabel(
    consecutiveDates.map((date, index) => {
      const dateKey = localDayStamp(date);
      return {
        value: totalsByDay.get(dateKey) ?? 0,
        label: index % MONTH_LABEL_STEP === 0 ? formatRangeEdge(date) : '',
        dateLabel: formatTooltipDate(date),
        dateKey,
      };
    })
  );

  const processedWeekData = processedMonthData.slice(-WEEK_DAYS).map((item) => {
    const date = new Date(`${item.dateKey}T00:00:00`);
    return {
      ...item,
      label: weekdayAbbrev(date),
    };
  });

  return { processedMonthData, processedWeekData };
}

function edgeBubbleShift(index: number, dataLength: number, isMonth: boolean) {
  if (index < 2) {
    return isMonth ? 36 : 20;
  }
  if (index > dataLength - 3) {
    return isMonth ? -40 : -30;
  }
  return 0;
}

export default function HistoryScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [viewMode, setViewMode] = useState<ViewMode>('week');
  const [showDropdown, setShowDropdown] = useState(false);
  const [weekOffset, setWeekOffset] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [monthData, setMonthData] = useState<HistoryBar[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  const maxWeekOffset = Math.min(0, WEEK_DAYS - monthData.length);

  const weekData = useMemo(() => {
    if (monthData.length === 0) {
      return [];
    }

    const end = monthData.length + weekOffset * WEEK_DAYS;
    const start = Math.max(0, end - WEEK_DAYS);
    return monthData.slice(start, end).map((item) => ({
      ...item,
      label: weekdayAbbrev(new Date(`${item.dateKey}T00:00:00`)),
    }));
  }, [monthData, weekOffset]);

  const chartData = viewMode === 'week' ? weekData : monthData;
  const rangeStart = chartData[0]?.dateLabel ?? '';
  const rangeEnd = chartData[chartData.length - 1]?.dateLabel ?? '';
  const canGoBack = viewMode === 'week' && weekOffset > maxWeekOffset;
  const canGoForward = viewMode === 'week' && weekOffset < 0;

  useFocusEffect(
    useCallback(() => {
      let ignore = false;
      setIsLoading(true);

      void fetchAndProcessHistoryData()
        .then((result) => {
          if (ignore) {
            return;
          }
          setMonthData(result.processedMonthData);
          setIsLoading(false);
        })
        .catch((error) => {
          console.error('读取历史卡路里失败', error);
          if (!ignore) {
            setMonthData([]);
            setIsLoading(false);
          }
        });

      return () => {
        ignore = true;
      };
    }, [])
  );
  const barWidth = viewMode === 'week' ? 20 : 6;
  const barSpacing = viewMode === 'week' ? 14 : 4;
  const maxValue = Math.max(...chartData.map((item) => item.value), 0);

  const totalCalories = chartData.reduce((sum, item) => sum + (Number(item.value) || 0), 0);
  const activeDays = chartData.filter((item) => item.value > 0).length;
  const dailyAverage =
    activeDays > 0 && Number.isFinite(totalCalories)
      ? Math.round(totalCalories / activeDays)
      : 0;
  const hasChartData = totalCalories > 0;

  const resetSelection = () => setSelectedIndex(null);

  const shiftRange = (delta: number) => {
    if (viewMode !== 'week') {
      return;
    }
    setShowDropdown(false);
    resetSelection();
    setWeekOffset((current) => Math.min(Math.max(current + delta, maxWeekOffset), 0));
  };

  const selectViewMode = (next: ViewMode) => {
    setViewMode(next);
    setShowDropdown(false);
    resetSelection();
  };

  return (
    <View style={styles.screen}>
      {showDropdown ? (
        <Pressable style={styles.dismissLayer} onPress={() => setShowDropdown(false)} />
      ) : null}

      <ScrollView
        contentContainerStyle={{
          paddingTop: 12,
          paddingBottom: Math.max(insets.bottom, 24) + 16,
        }}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled">
        <View style={styles.summaryCard}>
          <View style={styles.summaryTop}>
            <Pressable
              onPress={() => setShowDropdown((open) => !open)}
              style={({ pressed }) => [styles.rangeMenu, pressed && styles.pressed]}>
              <Text style={styles.rangeMenuText}>
                {viewMode === 'week' ? t('week') : t('month')}
              </Text>
              <Text style={styles.rangeMenuCaret}>▼</Text>
            </Pressable>

            {showDropdown ? (
              <View style={styles.dropdown}>
                <Pressable
                  onPress={() => selectViewMode('week')}
                  style={({ pressed }) => [styles.dropdownRow, pressed && styles.pressed]}>
                  <Text
                    style={[
                      styles.dropdownText,
                      viewMode === 'week' && styles.dropdownTextActive,
                    ]}>
                    {t('week')}
                  </Text>
                </Pressable>
                <Pressable
                  onPress={() => selectViewMode('month')}
                  style={({ pressed }) => [
                    styles.dropdownRow,
                    styles.dropdownRowLast,
                    pressed && styles.pressed,
                  ]}>
                  <Text
                    style={[
                      styles.dropdownText,
                      viewMode === 'month' && styles.dropdownTextActive,
                    ]}>
                    {t('month')}
                  </Text>
                </Pressable>
              </View>
            ) : null}
          </View>

          <Text style={styles.averageLabel}>{t('dailyAverage')}</Text>
          <View style={styles.averageRow}>
            <Text style={styles.averageValue}>{dailyAverage.toLocaleString()}</Text>
            <Text style={styles.averageUnit}> {t('kcal')}</Text>
          </View>
          <Text style={styles.totalCaption}>
            {t('totalCalories')} {totalCalories.toLocaleString()}
          </Text>

          <View style={styles.rangeRow}>
            <Pressable
              disabled={!canGoBack}
              onPress={() => shiftRange(-1)}
              hitSlop={12}
              style={({ pressed }) => pressed && styles.pressed}>
              <Text style={[styles.rangeArrow, !canGoBack && styles.rangeArrowMuted]}>◄</Text>
            </Pressable>
            <Text style={styles.rangeLabel}>
              {rangeStart && rangeEnd ? `${rangeStart} - ${rangeEnd}` : '—'}
            </Text>
            <Pressable
              disabled={!canGoForward}
              onPress={() => shiftRange(1)}
              hitSlop={12}
              style={({ pressed }) => pressed && styles.pressed}>
              <Text style={[styles.rangeArrow, !canGoForward && styles.rangeArrowMuted]}>►</Text>
            </Pressable>
          </View>
        </View>

        <View style={styles.chartCard}>
          {isLoading ? (
            <View style={styles.loadingBox}>
              <ActivityIndicator color={PANDAN} />
              <Text style={styles.loadingText}>{t('loadingHistory')}</Text>
            </View>
          ) : !hasChartData ? (
            <View style={styles.chartEmpty}>
              <Text style={styles.chartEmptyIcon}>📈</Text>
              <Text style={styles.chartEmptyText}>
                {t('calorieTrendsEmpty')}
              </Text>
            </View>
          ) : (
          <View style={[styles.chartRow, { columnGap: barSpacing }]}>
            {chartData.map((item, index) => {
              const selected = selectedIndex === index;
              const hasRecords = item.value > 0;
              const barHeight =
                hasRecords && maxValue > 0
                  ? Math.max(4, Math.round((item.value / maxValue) * BAR_HEIGHT))
                  : 0;
              const marginLeft = edgeBubbleShift(index, chartData.length, viewMode === 'month');

              const topLabelComponent = () => {
                if (selectedIndex !== index) {
                  return null;
                }

                return (
                  <View style={[styles.tooltip, { marginLeft }]}>
                    <Text style={styles.tooltipValue}>
                      {hasRecords ? `${item.value.toLocaleString()} ${t('kcal')}` : t('noRecords')}
                    </Text>
                    <Text style={styles.tooltipDate}>
                      {item.dateLabel || item.label || t('date')}
                    </Text>
                  </View>
                );
              };

              return (
                <Pressable
                  key={`${viewMode}-${item.dateLabel}-${index}`}
                  onPress={() => setSelectedIndex(selected ? null : index)}
                  hitSlop={viewMode === 'month' ? { left: 4, right: 4, top: 10, bottom: 8 } : 10}
                  style={[styles.barColumn, { width: barWidth, zIndex: selected ? 8 : 1 }]}>
                  <View style={styles.barTrack}>
                    {topLabelComponent()}
                    {hasRecords ? (
                      <View
                        style={[
                          styles.bar,
                          {
                            width: barWidth,
                            height: barHeight,
                            backgroundColor: selected ? TOOLTIP_FILL : BAR_IDLE,
                          },
                        ]}
                      />
                    ) : (
                      <View style={[styles.emptyHit, { width: barWidth }]} />
                    )}
                  </View>
                  <Text
                    style={[styles.axisLabel, viewMode === 'month' && styles.axisLabelMonth]}
                    numberOfLines={1}>
                    {item.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>
          )}
        </View>
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: WARM_BEIGE,
    paddingHorizontal: 20,
  },
  dismissLayer: {
    ...StyleSheet.absoluteFillObject,
    zIndex: 4,
  },
  summaryCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 16,
    paddingBottom: 18,
    marginBottom: 14,
    overflow: 'visible',
    zIndex: 5,
    ...CARD_SHADOW,
  },
  summaryTop: {
    alignItems: 'flex-start',
    marginBottom: 14,
    zIndex: 6,
  },
  rangeMenu: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingVertical: 4,
    paddingRight: 8,
  },
  rangeMenuText: {
    color: '#2C2A26',
    fontSize: 16,
    fontWeight: '600',
  },
  rangeMenuCaret: {
    color: '#9A958C',
    fontSize: 11,
  },
  dropdown: {
    position: 'absolute',
    top: 32,
    left: 0,
    minWidth: 128,
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 4,
    zIndex: 8,
    ...CARD_SHADOW,
  },
  dropdownRow: {
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  dropdownRowLast: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: '#EDE8E0',
  },
  dropdownText: {
    color: '#2C2A26',
    fontSize: 15,
  },
  dropdownTextActive: {
    color: PANDAN,
    fontWeight: '600',
  },
  averageLabel: {
    color: '#9A958C',
    fontSize: 13,
    marginBottom: 2,
  },
  averageRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  averageValue: {
    color: '#2C2A26',
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.6,
  },
  averageUnit: {
    color: '#2C2A26',
    fontSize: 18,
    fontWeight: '600',
  },
  totalCaption: {
    color: '#888888',
    fontSize: 14,
    marginTop: 6,
  },
  rangeRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 18,
  },
  rangeArrow: {
    color: PANDAN,
    fontSize: 16,
    paddingHorizontal: 4,
  },
  rangeArrowMuted: {
    color: '#E4DDD4',
  },
  rangeLabel: {
    color: '#2C2A26',
    fontSize: 15,
    fontWeight: '500',
  },
  chartCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 20,
    paddingTop: 20,
    paddingBottom: 16,
    paddingHorizontal: 16,
    overflow: 'visible',
    ...CARD_SHADOW,
  },
  loadingBox: {
    minHeight: BAR_HEIGHT + 58,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#9A958C',
    fontSize: 13,
  },
  chartEmpty: {
    minHeight: BAR_HEIGHT + 58,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
    paddingVertical: 24,
  },
  chartEmptyIcon: {
    fontSize: 28,
    marginBottom: 10,
    opacity: 0.55,
  },
  chartEmptyText: {
    color: '#9A958C',
    fontSize: 14,
    lineHeight: 21,
    textAlign: 'center',
  },
  chartRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'center',
    overflow: 'visible',
  },
  barColumn: {
    alignItems: 'center',
    overflow: 'visible',
    zIndex: 1,
  },
  barTrack: {
    height: BAR_HEIGHT + 58,
    width: '100%',
    alignItems: 'center',
    justifyContent: 'flex-end',
    overflow: 'visible',
  },
  bar: {
    borderRadius: 6,
  },
  emptyHit: {
    height: 1,
    backgroundColor: 'transparent',
  },
  axisLabel: {
    color: '#9A958C',
    fontSize: 12,
    marginTop: 8,
    height: 16,
    textAlign: 'center',
  },
  axisLabelMonth: {
    fontSize: 9,
    width: 36,
    marginTop: 10,
  },
  tooltip: {
    marginBottom: 4,
    alignItems: 'center',
    backgroundColor: TOOLTIP_FILL,
    paddingHorizontal: 8,
    paddingVertical: 6,
    borderRadius: 8,
    minWidth: 72,
    zIndex: 8,
  },
  tooltipValue: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '700',
  },
  tooltipDate: {
    color: 'rgba(255,255,255,0.9)',
    fontSize: 10,
    marginTop: 1,
  },
  pressed: {
    opacity: 0.72,
  },
});
