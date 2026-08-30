import DateTimePicker, {
  type DateTimePickerEvent,
} from '@react-native-community/datetimepicker';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useCallback, useMemo, useState } from 'react';
import {
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  OptionPicker,
  SettingsRow,
  SettingsSection,
  settingsStyles,
} from '@/components/settings-ui';
import { PANDAN, WARM_BEIGE } from '@/constants/brand';
import { saveNutritionTargets } from '@/lib/nutrition-targets';
import {
  ACTIVITY_LEVELS,
  dateFromDob,
  DEFAULT_PROFILE,
  dobFromDate,
  formatDobDisplay,
  GENDERS,
  loadUserProfile,
  PRIMARY_GOALS,
  saveUserProfile,
  type ActivityLevel,
  type Gender,
  type PrimaryGoal,
  type UserProfile,
} from '@/lib/user-profile';

type PickerKind = 'gender' | 'activityLevel' | 'primaryGoal';
type Translate = (key: string) => string;

function genderLabel(value: Gender, t: Translate) {
  return value === 'Female' ? t('genderFemale') : t('genderMale');
}

function activityLabel(value: ActivityLevel, t: Translate) {
  if (value === 'Sedentary') {
    return t('activitySedentary');
  }
  if (value === 'Light') {
    return t('activityLight');
  }
  if (value === 'Active') {
    return t('activityActive');
  }
  return t('activityModerate');
}

function goalLabel(value: PrimaryGoal, t: Translate) {
  if (value === 'Lose steadily') {
    return t('goalLoseSteadily');
  }
  if (value === 'Build muscle') {
    return t('goalBuildMuscle');
  }
  return t('goalMaintain');
}

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

function yearsFromDob(dob: Date): number {
  const today = new Date();
  let age = today.getFullYear() - dob.getFullYear();
  const monthDiff = today.getMonth() - dob.getMonth();
  if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < dob.getDate())) {
    age -= 1;
  }
  return age;
}

function isUsableNumber(value: number) {
  return Number.isFinite(value) && value > 0;
}

export default function PersonalDetailsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t } = useTranslation();
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [dob, setDob] = useState(() => dateFromDob(DEFAULT_PROFILE.dob));
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [picker, setPicker] = useState<PickerKind | null>(null);

  useFocusEffect(
    useCallback(() => {
      void loadUserProfile().then((next) => {
        setProfile(next);
        setDob(dateFromDob(next.dob));
      });
    }, [])
  );

  const patch = (partial: Partial<UserProfile>) => {
    setProfile((current) => {
      const next = { ...current, ...partial };
      void saveUserProfile(next);
      return next;
    });
  };

  const commitDob = (nextDob: Date) => {
    setDob(nextDob);
    patch({ dob: dobFromDate(nextDob) });
  };

  const handleDobChange = (event: DateTimePickerEvent, selectedDate?: Date) => {
    if (event.type === 'dismissed') {
      setShowDatePicker(false);
      return;
    }

    if (selectedDate) {
      commitDob(selectedDate);
    }

    if (Platform.OS === 'android' && event.type === 'set') {
      setShowDatePicker(false);
    }
  };

  const pickerConfig = useMemo(() => {
    if (picker === 'gender') {
      return {
        title: t('gender'),
        options: GENDERS.map((value) => genderLabel(value, t)),
        selected: genderLabel(profile.gender, t),
        onSelect: (label: string) => {
          const next = GENDERS.find((value) => genderLabel(value, t) === label);
          if (next) {
            patch({ gender: next });
          }
        },
      };
    }
    if (picker === 'activityLevel') {
      return {
        title: t('activityLevel'),
        options: ACTIVITY_LEVELS.map((value) => activityLabel(value, t)),
        selected: activityLabel(profile.activityLevel, t),
        onSelect: (label: string) => {
          const next = ACTIVITY_LEVELS.find((value) => activityLabel(value, t) === label);
          if (next) {
            patch({ activityLevel: next });
          }
        },
      };
    }
    if (picker === 'primaryGoal') {
      return {
        title: t('primaryGoal'),
        options: PRIMARY_GOALS.map((value) => goalLabel(value, t)),
        selected: goalLabel(profile.primaryGoal, t),
        onSelect: (label: string) => {
          const next = PRIMARY_GOALS.find((value) => goalLabel(value, t) === label);
          if (next) {
            patch({ primaryGoal: next });
          }
        },
      };
    }
    return null;
  }, [picker, profile.activityLevel, profile.gender, profile.primaryGoal, t]);

  const calculateNutritionGoals = useCallback(async () => {
    Keyboard.dismiss();

    const height = Number(profile.height);
    const weight = Number(profile.weight);
    const age = yearsFromDob(dob);

    if (!isUsableNumber(height) || !isUsableNumber(weight) || !isUsableNumber(age) || age >= 120) {
      Alert.alert(t('almostThere'), t('fillHeightWeightDob'));
      return;
    }

    const bmr =
      profile.gender === 'Male'
        ? 10 * weight + 6.25 * height - 5 * age + 5
        : 10 * weight + 6.25 * height - 5 * age - 161;

    const tdee = bmr * ACTIVITY_FACTORS[profile.activityLevel];
    const targetCalories = Math.round(tdee + GOAL_CALORIE_SHIFT[profile.primaryGoal]);
    const protein = Math.round((targetCalories * 0.3) / 4);
    const carbs = Math.round((targetCalories * 0.4) / 4);
    const fats = Math.round((targetCalories * 0.3) / 9);

    if (
      ![bmr, tdee, targetCalories, protein, carbs, fats].every(isUsableNumber)
    ) {
      Alert.alert(t('invalidProfileNumbers'), t('invalidProfileNumbers'));
      return;
    }

    try {
      await saveUserProfile({ ...profile, dob: dobFromDate(dob) });
      await saveNutritionTargets({
        calories: targetCalories,
        protein,
        carbs,
        fat: fats,
      });

      Alert.alert(t('goalsUpdatedTitle'), t('goalsUpdatedBody'), [
        { text: t('ok'), onPress: () => router.back() },
      ]);
    } catch (error) {
      console.error('保存营养目标失败', error);
      Alert.alert(t('saveFailed'), t('saveFailed'));
    }
  }, [dob, profile, router, t]);

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
        <SettingsSection title={t('bodyLifestyle')}>
          <SettingsRow label={t('heightCm')}>
            <TextInput
              value={profile.height}
              onChangeText={(height) => patch({ height })}
              keyboardType="decimal-pad"
              placeholder="cm"
              placeholderTextColor="#C4BEB5"
              style={settingsStyles.rowInput}
            />
          </SettingsRow>
          <SettingsRow label={t('currentWeightKg')}>
            <TextInput
              value={profile.weight}
              onChangeText={(weight) => patch({ weight })}
              keyboardType="decimal-pad"
              placeholder="kg"
              placeholderTextColor="#C4BEB5"
              style={settingsStyles.rowInput}
            />
          </SettingsRow>
          <SettingsRow label={t('dateOfBirth')}>
            <TouchableOpacity
              activeOpacity={0.7}
              onPress={() => {
                Keyboard.dismiss();
                setShowDatePicker(true);
              }}
              style={styles.dobTap}>
              <Text style={settingsStyles.rowValue}>{formatDobDisplay(dob)}</Text>
              <Text style={settingsStyles.chevron}>›</Text>
            </TouchableOpacity>
          </SettingsRow>
          <SettingsRow label={t('gender')} onPress={() => setPicker('gender')}>
            <Text style={settingsStyles.rowValue}>{genderLabel(profile.gender, t)}</Text>
            <Text style={settingsStyles.chevron}>›</Text>
          </SettingsRow>
          <SettingsRow label={t('activityLevel')} onPress={() => setPicker('activityLevel')}>
            <Text style={settingsStyles.rowValue}>{activityLabel(profile.activityLevel, t)}</Text>
            <Text style={settingsStyles.chevron}>›</Text>
          </SettingsRow>
          <SettingsRow last label={t('primaryGoal')} onPress={() => setPicker('primaryGoal')}>
            <Text style={settingsStyles.rowValue}>{goalLabel(profile.primaryGoal, t)}</Text>
            <Text style={settingsStyles.chevron}>›</Text>
          </SettingsRow>
        </SettingsSection>

        <Pressable
            onPress={() => {
              void calculateNutritionGoals();
            }}
          style={({ pressed }) => [settingsStyles.generateButton, pressed && settingsStyles.pressed]}>
          <Text style={settingsStyles.generateButtonText}>{t('autoGenerateGoals')}</Text>
        </Pressable>

        <Pressable
          onPress={() => Alert.alert(t('mifflinTitle'), t('mifflinBody'), [{ text: t('ok') }])}
          style={({ pressed }) => [styles.scienceButton, pressed && settingsStyles.pressed]}>
          <Text style={settingsStyles.scienceText}>ℹ️ {t('scienceBehindMath')}</Text>
        </Pressable>
      </ScrollView>

      {showDatePicker ? (
        Platform.OS === 'ios' ? (
          <View style={[styles.iosPickerSheet, { paddingBottom: Math.max(insets.bottom, 12) }]}>
            <View style={styles.iosPickerToolbar}>
              <Pressable onPress={() => setShowDatePicker(false)} hitSlop={12}>
                <Text style={styles.iosPickerDone}>{t('done')}</Text>
              </Pressable>
            </View>
            <DateTimePicker
              value={dob}
              mode="date"
              display="spinner"
              maximumDate={new Date()}
              onChange={handleDobChange}
            />
          </View>
        ) : (
          <DateTimePicker
            value={dob}
            mode="date"
            display="spinner"
            maximumDate={new Date()}
            onChange={handleDobChange}
          />
        )
      ) : null}

      <OptionPicker
        visible={picker !== null}
        title={pickerConfig?.title ?? ''}
        options={pickerConfig?.options ?? []}
        selected={pickerConfig?.selected ?? ''}
        onSelect={(value) => pickerConfig?.onSelect(value)}
        onClose={() => setPicker(null)}
      />
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
  scienceButton: {
    marginTop: 16,
    paddingVertical: 12,
    alignItems: 'center',
  },
  dobTap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
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
});
