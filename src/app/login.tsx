import { useCallback, useState } from 'react';
import AntDesign from '@expo/vector-icons/AntDesign';
import { makeRedirectUri } from 'expo-auth-session';
import * as QueryParams from 'expo-auth-session/build/QueryParams';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import * as WebBrowser from 'expo-web-browser';
import { ActivityIndicator, Alert, ImageBackground, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { supabase } from '@/lib/supabase';

WebBrowser.maybeCompleteAuthSession();

const CREAM = '#F5F5DC';
const redirectTo = makeRedirectUri({
  scheme: 'makanai',
  native: 'makanai://',
});

type LoginScreenProps = {
  onContinue?: () => void;
};

async function createSessionFromUrl(url: string) {
  const { params, errorCode } = QueryParams.getQueryParams(url);
  if (errorCode) {
    throw new Error(errorCode);
  }

  if (params.code) {
    const { data, error } = await supabase.auth.exchangeCodeForSession(params.code);
    if (error) {
      throw error;
    }
    return data.session;
  }

  const accessToken = params.access_token;
  const refreshToken = params.refresh_token;
  if (!accessToken || !refreshToken) {
    return null;
  }

  const { data, error } = await supabase.auth.setSession({
    access_token: accessToken,
    refresh_token: refreshToken,
  });
  if (error) {
    throw error;
  }
  return data.session;
}

export default function LoginScreen({ onContinue }: LoginScreenProps = {}) {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [loading, setLoading] = useState(false);

  const finishLogin = useCallback(() => {
    onContinue?.();
    router.replace('/');
  }, [onContinue, router]);

  const signInWithGoogle = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo,
          skipBrowserRedirect: true,
          queryParams: {
            access_type: 'offline',
            prompt: 'consent',
          },
        },
      });

      if (error) {
        throw error;
      }
      if (!data.url) {
        throw new Error('Google sign-in did not return an auth URL.');
      }

      const result = await WebBrowser.openAuthSessionAsync(data.url, redirectTo);
      if (result.type !== 'success' || !result.url) {
        return;
      }

      const session = await createSessionFromUrl(result.url);
      if (!session) {
        throw new Error('Could not create a session from Google sign-in.');
      }

      finishLogin();
    } catch (err) {
      console.error('Failed Google OAuth:', err);
      Alert.alert(
        'Sign in failed',
        err instanceof Error ? err.message : 'Please try again.'
      );
    } finally {
      setLoading(false);
    }
  }, [finishLogin]);

  return (
    <ImageBackground
      source={require('../../assets/images/login_background.jpg')}
      style={styles.screen}
      resizeMode="cover"
    >
      <StatusBar style="light" />
      <LinearGradient
        pointerEvents="none"
        colors={['rgba(0, 0, 0, 0.75)', 'rgba(0, 0, 0, 0.18)', 'transparent']}
        locations={[0, 0.45, 1]}
        style={styles.topScrim}
      />
      <LinearGradient
        pointerEvents="none"
        colors={['transparent', 'rgba(0, 0, 0, 0.8)']}
        style={styles.bottomScrim}
      />

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + 56,
            paddingBottom: Math.max(insets.bottom, 20) + 28,
          },
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title}>MakanAI</Text>
          <Text style={styles.subtitle}>Makan first? Scan first!</Text>
        </View>

        <View style={styles.footer}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Continue with Google"
            onPress={signInWithGoogle}
            disabled={loading}
            style={({ pressed }) => [
              styles.googleButton,
              pressed && styles.googleButtonPressed,
              loading && { opacity: 0.7 },
            ]}
          >
            <AntDesign name="google" size={20} color="#4285F4" />
            {loading ? (
              <>
                <ActivityIndicator size="small" color="#4285F4" style={{ marginRight: 8 }} />
                <Text style={styles.googleButtonText}>Signing in...</Text>
              </>
            ) : (
              <Text style={styles.googleButtonText}>Continue with Google</Text>
            )}
          </Pressable>
          <Text style={styles.disclaimer}>
            By continuing, you agree to our Terms of Service.
          </Text>
        </View>
      </View>
    </ImageBackground>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: CREAM,
  },
  topScrim: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    height: 260,
    zIndex: 1,
  },
  bottomScrim: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    height: 280,
    zIndex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 28,
  },
  header: {
    flex: 1,
    alignItems: 'center',
    zIndex: 2,
  },
  title: {
    color: '#FFFFFF',
    fontSize: 48,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  subtitle: {
    marginTop: 10,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '500',
    lineHeight: 22,
    letterSpacing: 1,
    textAlign: 'center',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 10,
  },
  footer: {
    alignItems: 'center',
    width: '100%',
    zIndex: 2,
  },
  googleButton: {
    width: '100%',
    maxWidth: 360,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
    backgroundColor: '#FFFFFF',
    borderRadius: 999,
    paddingVertical: 16,
    paddingHorizontal: 22,
    shadowColor: '#1C1916',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.12,
    shadowRadius: 16,
    elevation: 6,
  },
  googleButtonPressed: {
    opacity: 0.88,
  },
  googleButtonText: {
    color: '#2C2A26',
    fontSize: 16,
    fontWeight: '600',
  },
  disclaimer: {
    marginTop: 16,
    maxWidth: 280,
    color: 'rgba(255,255,255,0.7)',
    fontSize: 12,
    lineHeight: 18,
    textAlign: 'center',
  },
});