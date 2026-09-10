import { CameraView, useCameraPermissions } from 'expo-camera';
import { useFocusEffect, useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import {
  ActivityIndicator,
  Alert,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Linking,
  Modal,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  Vibration,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { PANDAN } from '@/constants/brand';
import { useUploadTask } from '@/context/UploadTaskContext';
import { captureEvent } from '@/lib/analytics';
import { consumePendingMealIntent, fetchImageAsBase64 } from '@/lib/pending-meal-photo';

type CapturedPhoto = {
  uri: string;
  base64: string;
};

function tapHaptic() {
  if (Platform.OS === 'web') {
    return;
  }
  Vibration.vibrate(50);
}

export default function CameraScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const cameraRef = useRef<CameraView>(null);
  const capturingRef = useRef(false);
  const sendingRef = useRef(false);
  const replaceMealIdRef = useRef<string | null>(null);
  const sourceRef = useRef<'camera' | 'gallery' | 'fix'>('camera');
  const [permission, requestPermission, getPermission] = useCameraPermissions();
  const [isCapturing, setIsCapturing] = useState(false);
  const [capturedPhoto, setCapturedPhoto] = useState<CapturedPhoto | null>(null);
  const [extraPrompt, setExtraPrompt] = useState('');
  const { startProcessingTask } = useUploadTask();
  const insets = useSafeAreaInsets();

  useFocusEffect(
    useCallback(() => {
      const pending = consumePendingMealIntent();
      if (!pending) {
        return;
      }

      capturingRef.current = false;
      sendingRef.current = false;
      setIsCapturing(false);

      if (pending.kind === 'photo') {
        sourceRef.current = 'gallery';
        replaceMealIdRef.current = null;
        setExtraPrompt('');
        setCapturedPhoto({
          uri: pending.uri,
          base64: pending.base64,
        });
        return;
      }

      if (pending.kind === 'fix') {
        sourceRef.current = 'fix';
        replaceMealIdRef.current = pending.mealId;
        setExtraPrompt(pending.extraNote);
        setCapturedPhoto({
          uri: pending.imageUrl,
          base64: '',
        });
        void fetchImageAsBase64(pending.imageUrl)
          .then((base64) => {
            setCapturedPhoto((current) =>
              current && current.uri === pending.imageUrl ? { uri: pending.imageUrl, base64 } : current
            );
          })
          .catch((error) => {
            console.error('读取原餐图失败', error);
            Alert.alert(t('captureFailed'), t('captureFailedHint'));
          });
        return;
      }

      replaceMealIdRef.current = null;
      setExtraPrompt('');
      setCapturedPhoto(null);
      sourceRef.current = 'camera';
    }, [t])
  );

  useFocusEffect(
    useCallback(() => {
      if (capturedPhoto) {
        return;
      }

      void getPermission();
    }, [capturedPhoto, getPermission])
  );

  const handleAllowCamera = useCallback(async () => {
    try {
      const current = permission ?? (await getPermission());
      if (current?.granted) {
        return;
      }

      if (current?.canAskAgain === false) {
        await Linking.openSettings();
        await getPermission();
        return;
      }

      const result = await requestPermission();
      if (result.granted) {
        captureEvent('camera_permission', { granted: true });
        return;
      }

      captureEvent('camera_permission', { granted: false });
      if (result.canAskAgain === false) {
        await Linking.openSettings();
        await getPermission();
      }
    } catch (error) {
      console.error('相机权限请求失败', error);
      Alert.alert(t('cameraPermissionTitle'), t('cameraPermissionHint'));
    }
  }, [getPermission, permission, requestPermission, t]);

  const goHome = useCallback(() => {
    router.replace('/');
  }, [router]);

  const handleRetake = useCallback(() => {
    captureEvent('photo_retaken', { source: sourceRef.current });
    Keyboard.dismiss();
    capturingRef.current = false;
    sendingRef.current = false;
    setIsCapturing(false);
    setCapturedPhoto(null);
    setExtraPrompt('');
    sourceRef.current = 'camera';
  }, []);

  const handleSend = useCallback(() => {
    if (!capturedPhoto || sendingRef.current) {
      return;
    }

    tapHaptic();
    sendingRef.current = true;
    Keyboard.dismiss();

    const note = extraPrompt.trim();
    const replaceMealId = replaceMealIdRef.current ?? undefined;
    const reuseImageUrl = capturedPhoto.uri.startsWith('http') ? capturedPhoto.uri : undefined;
    captureEvent('meal_submit_tapped', {
      source: sourceRef.current,
      has_note: note.length > 0,
      is_replace: Boolean(replaceMealId),
    });

    void (async () => {
      try {
        let base64 = capturedPhoto.base64;
        if (!base64) {
          base64 = await fetchImageAsBase64(capturedPhoto.uri);
        }

        void startProcessingTask(capturedPhoto.uri, base64, note.length > 0 ? note : undefined, {
          replaceMealId,
          reuseImageUrl,
        });
        router.replace('/');
      } catch (error) {
        console.error('重新分析失败', error);
        Alert.alert(t('captureFailed'), t('captureFailedHint'));
        sendingRef.current = false;
      }
    })();
  }, [capturedPhoto, extraPrompt, router, startProcessingTask, t]);

  const handleCapture = useCallback(async () => {
    const camera = cameraRef.current;
    if (!camera || capturingRef.current) {
      return;
    }

    tapHaptic();
    capturingRef.current = true;
    setIsCapturing(true);

    try {
      const photo = await camera.takePictureAsync({
        base64: true,
        quality: 0.7,
        shutterSound: false,
      });

      if (!photo?.base64) {
        Alert.alert(t('captureFailed'), t('captureFailedHint'));
        return;
      }

      sourceRef.current = 'camera';
      setCapturedPhoto({
        uri: photo.uri ?? `data:image/jpeg;base64,${photo.base64}`,
        base64: photo.base64,
      });
      setExtraPrompt('');
      captureEvent('photo_captured', { source: 'camera' });
    } catch (error) {
      console.error('拍照失败', error);
      Alert.alert(t('captureFailed'), t('cameraBusy'));
    } finally {
      capturingRef.current = false;
      setIsCapturing(false);
    }
  }, [t]);

  if (capturedPhoto) {
    return (
      <KeyboardAvoidingView
        style={styles.previewContainer}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={0}>
        <StatusBar style="light" />

        <View style={styles.previewStage} collapsable={false}>
          <Image
            source={{ uri: capturedPhoto.uri }}
            style={styles.previewImage}
            resizeMode="cover"
          />
          <Pressable
            onPress={handleRetake}
            style={[styles.closeChip, { top: insets.top + 8 }]}
            hitSlop={12}>
            <Text style={styles.closeChipText}>{t('retake')}</Text>
          </Pressable>
        </View>

        <View
          style={[
            styles.previewFooter,
            { paddingBottom: Math.max(insets.bottom, 16) },
          ]}>
          <TextInput
            value={extraPrompt}
            onChangeText={setExtraPrompt}
            placeholder={t('extraPromptPlaceholder')}
            placeholderTextColor="rgba(255,255,255,0.46)"
            style={styles.contextInput}
            returnKeyType="done"
            blurOnSubmit
            onSubmitEditing={Keyboard.dismiss}
            selectionColor="rgba(255,255,255,0.7)"
          />
          <Pressable
            onPress={handleSend}
            style={({ pressed }) => [styles.sendButton, pressed && styles.pressed]}>
            <Text style={styles.sendButtonText}>{t('usePhoto')}</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    );
  }

  if (!permission) {
    return (
      <View style={styles.fallback}>
        <StatusBar style="light" />
        <ActivityIndicator color="#ffffff" />
      </View>
    );
  }

  if (!permission.granted) {
    return (
      <View style={styles.fallback}>
        <StatusBar style="light" />
        <Modal
          visible
          transparent={false}
          animationType="fade"
          presentationStyle="fullScreen"
          onRequestClose={goHome}>
          <View style={styles.fallback}>
            <Text style={styles.permissionTitle}>{t('cameraPermissionTitle')}</Text>
            <Text style={styles.permissionHint}>{t('cameraPermissionHint')}</Text>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('allowCamera')}
              onPress={() => {
                void handleAllowCamera();
              }}
              style={({ pressed }) => [styles.permissionButton, pressed && styles.pressed]}>
              <Text style={styles.permissionButtonText}>{t('allowCamera')}</Text>
            </Pressable>
            <Pressable onPress={goHome} style={styles.textButton}>
              <Text style={styles.textButtonLabel}>{t('backHome')}</Text>
            </Pressable>
          </View>
        </Modal>
      </View>
    );
  }

  return (
    <View style={styles.container} collapsable={false}>
      <StatusBar style="light" />
      <CameraView ref={cameraRef} style={styles.preview} facing="back" mode="picture" />

      <Pressable onPress={goHome} style={[styles.closeChip, { top: insets.top + 8 }]} hitSlop={12}>
        <Text style={styles.closeChipText}>{t('close')}</Text>
      </Pressable>

      <View
        style={[styles.shutterBar, { paddingBottom: Math.max(insets.bottom, 28) }]}
        pointerEvents="box-none">
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('takePhoto')}
          disabled={isCapturing}
          onPress={handleCapture}
          hitSlop={12}
          style={({ pressed }) => [
            styles.shutterOuter,
            (pressed || isCapturing) && styles.shutterPressed,
            isCapturing && styles.shutterDisabled,
          ]}>
          <View style={styles.shutterInner} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  previewContainer: {
    flex: 1,
    justifyContent: 'flex-end',
    backgroundColor: '#000000',
  },
  preview: {
    flex: 1,
  },
  previewStage: {
    flex: 1,
    backgroundColor: '#000000',
  },
  previewImage: {
    width: '100%',
    height: '100%',
  },
  previewFooter: {
    paddingHorizontal: 20,
    paddingTop: 16,
    gap: 12,
    backgroundColor: 'rgba(8, 6, 4, 0.92)',
  },
  contextInput: {
    width: '100%',
    borderRadius: 16,
    paddingHorizontal: 18,
    paddingVertical: 14,
    backgroundColor: 'rgba(255,255,255,0.14)',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255,255,255,0.22)',
    color: '#ffffff',
    fontSize: 15,
    lineHeight: 20,
  },
  sendButton: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 16,
    borderRadius: 999,
    backgroundColor: PANDAN,
  },
  sendButtonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
  },
  closeChip: {
    position: 'absolute',
    left: 16,
    zIndex: 2,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: 'rgba(18, 16, 14, 0.55)',
  },
  closeChipText: {
    color: '#ffffff',
    fontSize: 13,
    fontWeight: '500',
  },
  shutterBar: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    alignItems: 'center',
  },
  shutterOuter: {
    width: 76,
    height: 76,
    borderRadius: 38,
    borderWidth: 3,
    borderColor: '#ffffff',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.18)',
  },
  shutterInner: {
    width: 58,
    height: 58,
    borderRadius: 29,
    backgroundColor: '#ffffff',
  },
  shutterPressed: {
    transform: [{ scale: 0.94 }],
    opacity: 0.85,
  },
  shutterDisabled: {
    opacity: 0.45,
  },
  fallback: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    gap: 12,
  },
  permissionTitle: {
    color: '#ffffff',
    fontSize: 20,
    fontWeight: '600',
  },
  permissionHint: {
    color: 'rgba(255,255,255,0.62)',
    fontSize: 15,
    textAlign: 'center',
    marginBottom: 8,
  },
  permissionButton: {
    marginTop: 8,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderRadius: 999,
    backgroundColor: '#ffffff',
  },
  permissionButtonText: {
    color: '#000000',
    fontSize: 16,
    fontWeight: '600',
  },
  textButton: {
    marginTop: 8,
    paddingVertical: 10,
  },
  textButtonLabel: {
    color: 'rgba(255,255,255,0.72)',
    fontSize: 15,
  },
  pressed: {
    opacity: 0.72,
  },
});
