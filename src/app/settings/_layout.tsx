import { Stack, useNavigation, useSegments } from 'expo-router';
import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';

import { WARM_BEIGE } from '@/constants/brand';

const TAB_BAR_STYLE = {
  backgroundColor: WARM_BEIGE,
  borderTopWidth: 0,
  elevation: 0,
  shadowOpacity: 0,
  height: 72,
};

const NESTED_SETTINGS_ROUTES = [
  'personal-details',
  'nutrition-goals',
  'history',
  'terms',
  'privacy',
] as const;

export default function SettingsLayout() {
  const { t } = useTranslation();
  const segments = useSegments();
  const navigation = useNavigation();
  const isNested = NESTED_SETTINGS_ROUTES.some((route) => segments.includes(route));

  useEffect(() => {
    const parent = navigation.getParent();
    parent?.setOptions({
      tabBarStyle: isNested ? { display: 'none' } : TAB_BAR_STYLE,
    });

    return () => {
      parent?.setOptions({ tabBarStyle: TAB_BAR_STYLE });
    };
  }, [isNested, navigation]);

  return (
    <Stack
      screenOptions={{
        headerShown: true,
        headerShadowVisible: false,
        headerStyle: { backgroundColor: WARM_BEIGE },
        headerTintColor: '#2C2A26',
        headerTitleStyle: { fontWeight: '600', fontSize: 17 },
        contentStyle: { backgroundColor: WARM_BEIGE },
      }}>
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="personal-details" options={{ title: t('personalDetails') }} />
      <Stack.Screen name="nutrition-goals" options={{ title: t('nutritionGoals') }} />
      <Stack.Screen name="history" options={{ title: t('history'), headerRight: () => null }} />
      <Stack.Screen name="terms" options={{ title: t('termsAndConditions') }} />
      <Stack.Screen name="privacy" options={{ title: t('privacyPolicy') }} />
    </Stack>
  );
}
