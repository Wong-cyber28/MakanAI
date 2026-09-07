import '../locales/i18n';

import { BottomSheetModal, BottomSheetModalProvider } from '@gorhom/bottom-sheet';
import { Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SymbolView } from 'expo-symbols';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { AddMealSheet } from '@/components/add-meal-sheet';
import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { MUTED_ICON, PANDAN, WARM_BEIGE } from '@/constants/brand';
import { UploadTaskProvider } from '@/context/UploadTaskContext';
import { supabase } from '@/lib/supabase';
import LoginScreen from './login';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

function CameraFab({
  onPress,
  accessibilityLabel,
  accessibilityState,
}: {
  onPress?: () => void;
  accessibilityLabel: string;
  accessibilityState?: { selected?: boolean };
}) {
  const selected = accessibilityState?.selected === true;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      accessibilityState={accessibilityState}
      style={styles.fabWrap}>
      <View style={[styles.fab, selected && styles.fabSelected]}>
        <SymbolView
          name={{ ios: 'camera.fill', android: 'photo_camera', web: 'camera' }}
          tintColor="#ffffff"
          size={26}
        />
      </View>
    </Pressable>
  );
}

export default function RootLayout() {
  const { t } = useTranslation();
  const addMealSheetRef = useRef<BottomSheetModal>(null);
  const [authReady, setAuthReady] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [sessionUserId, setSessionUserId] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;

    const applySession = (session: { user?: { id?: string } | null } | null) => {
      setIsSignedIn(Boolean(session));
      setSessionUserId(session?.user?.id ?? null);
    };

    void supabase.auth.getSession().then(({ data }) => {
      if (!ignore) {
        applySession(data.session);
        setAuthReady(true);
      }
    }).catch(() => {
      if (!ignore) {
        setAuthReady(true);
      }
    });

    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      applySession(session);
    });

    return () => {
      ignore = true;
      data.subscription.unsubscribe();
    };
  }, []);

  const openAddMealSheet = useCallback(() => {
    addMealSheetRef.current?.present();
  }, []);

  const handleLoginContinue = useCallback(() => {
    setIsSignedIn(true);
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <BottomSheetModalProvider>
        <AnimatedSplashOverlay />
        <UploadTaskProvider key={sessionUserId ?? 'signed-out'}>
          <View style={styles.root}>
            <Tabs
            screenOptions={{
              headerShown: false,
              tabBarShowLabel: false,
              tabBarActiveTintColor: PANDAN,
              tabBarInactiveTintColor: MUTED_ICON,
              tabBarStyle: {
                backgroundColor: WARM_BEIGE,
                borderTopWidth: 0,
                elevation: 0,
                shadowOpacity: 0,
                height: 72,
              },
            }}>
            <Tabs.Screen
              name="index"
              options={{
                title: t('home'),
                tabBarIcon: ({ color }) => (
                  <SymbolView
                    name={{ ios: 'house.fill', android: 'home', web: 'home' }}
                    tintColor={color}
                    size={24}
                  />
                ),
              }}
            />
            <Tabs.Screen
              name="camera"
              options={{
                title: t('camera'),
                tabBarButton: (props) => (
                  <CameraFab
                    onPress={openAddMealSheet}
                    accessibilityLabel={t('addMeal')}
                    accessibilityState={props.accessibilityState}
                  />
                ),
                tabBarStyle: { display: 'none' },
              }}
            />
            <Tabs.Screen
              name="settings"
              options={{
                title: t('settings'),
                tabBarIcon: ({ color }) => (
                  <SymbolView
                    name={{ ios: 'gearshape.fill', android: 'settings', web: 'settings' }}
                    tintColor={color}
                    size={24}
                  />
                ),
              }}
            />
            <Tabs.Screen
              name="login"
              options={{
                href: null,
                headerShown: false,
                tabBarStyle: { display: 'none' },
              }}
            />
          </Tabs>
          </View>
          <AddMealSheet sheetRef={addMealSheetRef} />
        </UploadTaskProvider>
        <Modal
          visible={authReady && !isSignedIn}
          animationType="fade"
          presentationStyle="fullScreen"
          statusBarTranslucent
          onRequestClose={() => {}}>
          <LoginScreen onContinue={handleLoginContinue} />
        </Modal>
      </BottomSheetModalProvider>
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
  fabWrap: {
    top: -18,
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fab: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: PANDAN,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#1C1C1A',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.18,
    shadowRadius: 12,
    elevation: 8,
  },
  fabSelected: {
    transform: [{ scale: 1.04 }],
  },
});
