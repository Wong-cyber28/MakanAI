import { ScrollView, StyleSheet, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { WARM_BEIGE } from '@/constants/brand';

export default function PrivacyScreen() {
  const insets = useSafeAreaInsets();

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: 20,
        paddingBottom: Math.max(insets.bottom, 24) + 16,
      }}
      showsVerticalScrollIndicator={false}>
      <Text style={styles.body}>Privacy policy will be updated soon.</Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: WARM_BEIGE,
    paddingHorizontal: 24,
  },
  body: {
    color: '#8A847A',
    fontSize: 16,
    lineHeight: 24,
  },
});
