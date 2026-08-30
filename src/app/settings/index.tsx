import { Image } from 'expo-image';
import { useFocusEffect, useRouter, type Href } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { CARD_SHADOW, LinkRow, OptionPicker, SettingsSection } from '@/components/settings-ui';
import { WARM_BEIGE } from '@/constants/brand';
import i18n, {
  APP_LANGUAGES,
  changeAppLanguage,
  getAppLanguage,
  getLanguageLabel,
  isAppLanguage,
} from '@/locales/i18n';
import {
  ageFromDob,
  DEFAULT_PROFILE,
  loadUserProfile,
  saveUserProfile,
  type UserProfile,
} from '@/lib/user-profile';

const AVATAR_URI = 'https://ui-avatars.com/api/?name=Wong+Ying+Boy&background=random';
const SUPPORT_EMAIL = 'makanai.app@gmail.com';

function openSupportMail(subject: string) {
  const url = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}`;
  void Linking.openURL(url).catch(() => {
    Alert.alert(i18n.t('cannotOpenMail'), i18n.t('setMailApp'));
  });
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { t, i18n } = useTranslation();
  const [profile, setProfile] = useState<UserProfile>(DEFAULT_PROFILE);
  const [showLanguagePicker, setShowLanguagePicker] = useState(false);
  const currentLanguage = getAppLanguage(i18n.resolvedLanguage ?? i18n.language);

  const age = ageFromDob(profile.dob);
  const ageLabel = age ? t('yearsOld', { count: age }) : t('addBirthday');

  useFocusEffect(
    useCallback(() => {
      void loadUserProfile().then(setProfile);
    }, [])
  );

  const persistName = (displayName: string) => {
    const next = { ...profile, displayName };
    setProfile(next);
    void saveUserProfile(next);
  };

  const showSoon = (title: string) => {
    Alert.alert(title, t('comingSoon'));
  };

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 16,
        paddingBottom: Math.max(insets.bottom, 28) + 32,
      }}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}>
      <StatusBar style="dark" />

      <View style={styles.profileCard}>
        <Image
          source={{ uri: AVATAR_URI }}
          style={styles.avatar}
          contentFit="cover"
          transition={200}
        />
        <View style={styles.profileCopy}>
          <TextInput
            value={profile.displayName}
            onChangeText={(displayName) => setProfile((current) => ({ ...current, displayName }))}
            onEndEditing={(event) => persistName(event.nativeEvent.text.trim() || DEFAULT_PROFILE.displayName)}
            placeholder={t('yourName')}
            placeholderTextColor="#C4BEB5"
            autoCorrect={false}
            style={styles.nameInput}
          />
          <Text style={styles.ageLabel}>{ageLabel}</Text>
        </View>
      </View>

      <SettingsSection title={t('account')}>
        <LinkRow
          label={t('personalDetails')}
          onPress={() => router.push('/settings/personal-details')}
        />
        <LinkRow
          label={t('nutritionGoals')}
          onPress={() => router.push('/settings/nutrition-goals')}
        />
        <LinkRow
          last
          label={t('historyTrends')}
          onPress={() => router.push('/settings/history' as Href)}
        />
      </SettingsSection>

      <SettingsSection title={t('preferences')}>
        <LinkRow
          label={t('language')}
          value={getLanguageLabel(currentLanguage)}
          last
          onPress={() => setShowLanguagePicker(true)}
        />
      </SettingsSection>

      <SettingsSection title={t('helpSupport')}>
        <LinkRow
          label={t('requestFeature')}
          onPress={() => openSupportMail('Feature Request: MakanAI')}
        />
        <LinkRow
          label={t('supportEmail')}
          onPress={() => openSupportMail('Support: MakanAI')}
        />
        <LinkRow
          label={t('termsAndConditions')}
          onPress={() => router.push('/settings/terms')}
        />
        <LinkRow
          last
          label={t('privacyPolicy')}
          onPress={() => router.push('/settings/privacy')}
        />
      </SettingsSection>

      <SettingsSection title={t('accountActions')}>
        <LinkRow chevron={false} label={t('logout')} onPress={() => showSoon(t('logout'))} />
        <LinkRow
          last
          danger
          label={t('deleteAccount')}
          onPress={() =>
            Alert.alert(t('deleteAccount'), t('deleteAccountMessage'), [
              { text: t('cancel'), style: 'cancel' },
              { text: t('delete'), style: 'destructive' },
            ])
          }
        />
      </SettingsSection>

      <OptionPicker
        visible={showLanguagePicker}
        title={t('language')}
        options={APP_LANGUAGES.map((language) => language.label)}
        selected={getLanguageLabel(currentLanguage)}
        onSelect={(label) => {
          const next = APP_LANGUAGES.find((language) => language.label === label);
          if (next && isAppLanguage(next.code)) {
            void changeAppLanguage(next.code);
          }
        }}
        onClose={() => setShowLanguagePicker(false)}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: WARM_BEIGE,
    paddingHorizontal: 20,
  },
  profileCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 22,
    ...CARD_SHADOW,
  },
  avatar: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: '#EDE6DC',
  },
  profileCopy: {
    flex: 1,
    minWidth: 0,
  },
  nameInput: {
    color: '#2C2A26',
    fontSize: 22,
    fontWeight: '600',
    padding: 0,
    margin: 0,
    borderWidth: 0,
  },
  ageLabel: {
    color: '#9A958C',
    fontSize: 13,
    marginTop: 4,
  },
});
