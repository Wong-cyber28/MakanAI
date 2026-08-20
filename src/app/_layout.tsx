import '../locales/i18n';

import { Tabs } from 'expo-router';
import * as SplashScreen from 'expo-splash-screen';
import { SymbolView } from 'expo-symbols';
import { useTranslation } from 'react-i18next';
import { Pressable, StyleSheet, View } from 'react-native';

import { AnimatedSplashOverlay } from '@/components/animated-icon';
import { MUTED_ICON, PANDAN, WARM_BEIGE } from '@/constants/brand';
import { UploadTaskProvider } from '@/context/UploadTaskContext';

export { ErrorBoundary } from 'expo-router';

SplashScreen.preventAutoHideAsync();

function CameraFab({
  onPress,
  accessibilityState,
}: {
  onPress?: (event: unknown) => void;
  accessibilityState?: { selected?: boolean };
}) {
  const selected = accessibilityState?.selected === true;

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel="打开相机"
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

  return (
    <UploadTaskProvider>
      <AnimatedSplashOverlay />
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
              <CameraFab onPress={props.onPress} accessibilityState={props.accessibilityState} />
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
      </Tabs>
    </UploadTaskProvider>
  );
}

const styles = StyleSheet.create({
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
