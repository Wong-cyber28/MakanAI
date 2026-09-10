import {
  BottomSheetBackdrop,
  BottomSheetModal,
  BottomSheetView,
  TouchableOpacity,
  type BottomSheetBackdropProps,
} from '@gorhom/bottom-sheet';
import { useRouter } from 'expo-router';
import * as ImagePicker from 'expo-image-picker';
import { SymbolView } from 'expo-symbols';
import { useCallback, type RefObject } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PANDAN, WARM_BEIGE } from '@/constants/brand';
import { useUploadTask } from '@/context/UploadTaskContext';
import { captureEvent } from '@/lib/analytics';
import { requestLiveCamera, setPendingMealPhoto } from '@/lib/pending-meal-photo';

type Props = {
  sheetRef: RefObject<BottomSheetModal | null>;
};

function renderBackdrop(props: BottomSheetBackdropProps) {
  return (
    <BottomSheetBackdrop
      {...props}
      appearsOnIndex={0}
      disappearsOnIndex={-1}
      opacity={0.28}
      pressBehavior="close"
    />
  );
}

export function AddMealSheet({ sheetRef }: Props) {
  const { t } = useTranslation();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { isProcessing } = useUploadTask();

  const dismiss = useCallback(() => {
    sheetRef.current?.dismiss();
  }, [sheetRef]);

  const handleSheetChange = useCallback((index: number) => {
    if (index >= 0) {
      captureEvent('add_meal_opened');
    }
  }, []);

  const handleTakePhoto = useCallback(() => {
    if (isProcessing) {
      return;
    }
    captureEvent('add_meal_source_selected', { source: 'camera' });
    requestLiveCamera();
    dismiss();
    router.push('/camera');
  }, [dismiss, isProcessing, router]);

  const handleChooseFromGallery = useCallback(async () => {
    if (isProcessing) {
      return;
    }
    captureEvent('add_meal_source_selected', { source: 'gallery' });
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      captureEvent('add_meal_gallery_permission', { granted: false });
      dismiss();
      Alert.alert(t('photoPermissionTitle'), t('galleryPermissionHint'));
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: false,
      quality: 0.7,
      base64: true,
    });

    if (result.canceled) {
      captureEvent('add_meal_gallery_canceled');
      return;
    }

    const asset = result.assets[0];
    const uri = asset?.uri;
    const base64 = asset?.base64;
    if (!uri || !base64) {
      dismiss();
      Alert.alert(t('captureFailed'), t('captureFailedHint'));
      return;
    }

    captureEvent('add_meal_photo_picked', { source: 'gallery' });
    setPendingMealPhoto({ uri, base64 });
    dismiss();
    router.push('/camera');
  }, [dismiss, isProcessing, router, t]);

  return (
    <BottomSheetModal
      ref={sheetRef}
      enableDynamicSizing
      enablePanDownToClose
      onChange={handleSheetChange}
      backdropComponent={renderBackdrop}
      backgroundStyle={styles.sheetBackground}
      handleIndicatorStyle={styles.handle}>
      <BottomSheetView
        style={[styles.content, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}>
        <Text style={styles.title}>{t('addMeal')}</Text>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('takeAPhoto')}
          accessibilityState={{ disabled: isProcessing }}
          activeOpacity={0.82}
          disabled={isProcessing}
          onPress={handleTakePhoto}
          style={[styles.option, isProcessing && styles.optionDisabled]}>
          <View style={styles.iconWell}>
            <SymbolView
              name={{ ios: 'camera.fill', android: 'photo_camera', web: 'camera' }}
              tintColor={PANDAN}
              size={22}
            />
          </View>
          <Text style={styles.optionLabel}>{t('takeAPhoto')}</Text>
        </TouchableOpacity>

        <TouchableOpacity
          accessibilityRole="button"
          accessibilityLabel={t('chooseFromGallery')}
          accessibilityState={{ disabled: isProcessing }}
          activeOpacity={0.82}
          disabled={isProcessing}
          onPress={() => {
            void handleChooseFromGallery();
          }}
          style={[styles.option, isProcessing && styles.optionDisabled]}>
          <View style={styles.iconWell}>
            <SymbolView
              name={{ ios: 'photo.on.rectangle', android: 'photo_library', web: 'image' }}
              tintColor={PANDAN}
              size={22}
            />
          </View>
          <Text style={styles.optionLabel}>{t('chooseFromGallery')}</Text>
        </TouchableOpacity>
      </BottomSheetView>
    </BottomSheetModal>
  );
}

const styles = StyleSheet.create({
  sheetBackground: {
    backgroundColor: WARM_BEIGE,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
  },
  handle: {
    width: 40,
    backgroundColor: '#E4DDD4',
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 4,
    gap: 10,
  },
  title: {
    color: '#2C2A26',
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 6,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 18,
    paddingVertical: 16,
    paddingHorizontal: 16,
    shadowColor: '#1C1916',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 2,
  },
  optionDisabled: {
    opacity: 0.45,
  },
  iconWell: {
    width: 48,
    height: 48,
    borderRadius: 16,
    backgroundColor: WARM_BEIGE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  optionLabel: {
    flex: 1,
    color: '#2C2A26',
    fontSize: 17,
    fontWeight: '600',
  },
});
