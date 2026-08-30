import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CARD_SHADOW } from '@/components/settings-ui';
import { WARM_BEIGE } from '@/constants/brand';
import {
  DEFAULT_NUTRITION_TARGETS,
  loadNutritionTargets,
  saveNutritionTargets,
  type NutritionTargets,
} from '@/lib/nutrition-targets';

function GoalCard({
  label,
  unit,
  value,
  onChangeText,
  onEndEditing,
}: {
  label: string;
  unit: string;
  value: string;
  onChangeText: (value: string) => void;
  onEndEditing: () => void;
}) {
  return (
    <View style={styles.goalCard}>
      <Text style={styles.goalLabel}>{label}</Text>
      <TextInput
        value={value}
        onChangeText={onChangeText}
        onEndEditing={onEndEditing}
        keyboardType="number-pad"
        style={styles.goalValue}
      />
      <Text style={styles.goalUnit}>{unit}</Text>
    </View>
  );
}

export default function NutritionGoalsScreen() {
  const { t } = useTranslation();
  const insets = useSafeAreaInsets();
  const [calories, setCalories] = useState(String(DEFAULT_NUTRITION_TARGETS.calories));
  const [protein, setProtein] = useState(String(DEFAULT_NUTRITION_TARGETS.protein));
  const [carbs, setCarbs] = useState(String(DEFAULT_NUTRITION_TARGETS.carbs));
  const [fats, setFats] = useState(String(DEFAULT_NUTRITION_TARGETS.fat));

  useFocusEffect(
    useCallback(() => {
      void loadNutritionTargets().then((targets) => {
        setCalories(String(targets.calories));
        setProtein(String(targets.protein));
        setCarbs(String(targets.carbs));
        setFats(String(targets.fat));
      });
    }, [])
  );

  const persist = (next: { calories: string; protein: string; carbs: string; fats: string }) => {
    const parsed: NutritionTargets = {
      calories: Math.round(Number(next.calories)),
      protein: Math.round(Number(next.protein)),
      carbs: Math.round(Number(next.carbs)),
      fat: Math.round(Number(next.fats)),
    };

    if (Object.values(parsed).some((value) => !Number.isFinite(value) || value <= 0)) {
      return;
    }

    void saveNutritionTargets(parsed).catch((error) => {
      console.error('保存营养目标失败', error);
    });
  };

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={{
          paddingTop: 16,
          paddingBottom: Math.max(insets.bottom, 20) + 24,
        }}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}>
        <Text style={styles.hint}>{t('manualOverride')}</Text>
        <Text style={styles.hintCopy}>{t('nutritionOverrideHint')}</Text>

        <GoalCard
          label={t('calories')}
          unit={t('kcal')}
          value={calories}
          onChangeText={setCalories}
          onEndEditing={() => persist({ calories, protein, carbs, fats })}
        />
        <GoalCard
          label={t('protein')}
          unit="g"
          value={protein}
          onChangeText={setProtein}
          onEndEditing={() => persist({ calories, protein, carbs, fats })}
        />
        <GoalCard
          label={t('carbs')}
          unit="g"
          value={carbs}
          onChangeText={setCarbs}
          onEndEditing={() => persist({ calories, protein, carbs, fats })}
        />
        <GoalCard
          label={t('fats')}
          unit="g"
          value={fats}
          onChangeText={setFats}
          onEndEditing={() => persist({ calories, protein, carbs, fats })}
        />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: WARM_BEIGE,
  },
  screen: {
    flex: 1,
    backgroundColor: WARM_BEIGE,
    paddingHorizontal: 20,
  },
  hint: {
    color: '#8A847A',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 4,
    marginBottom: 6,
  },
  hintCopy: {
    color: '#9A958C',
    fontSize: 14,
    lineHeight: 20,
    paddingHorizontal: 4,
    marginBottom: 18,
  },
  goalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 20,
    paddingVertical: 18,
    marginBottom: 12,
    ...CARD_SHADOW,
  },
  goalLabel: {
    color: '#8A847A',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 8,
  },
  goalValue: {
    color: '#2C2A26',
    fontSize: 36,
    fontWeight: '600',
    letterSpacing: -0.6,
    padding: 0,
  },
  goalUnit: {
    color: '#C4BEB5',
    fontSize: 13,
    marginTop: 4,
  },
});
