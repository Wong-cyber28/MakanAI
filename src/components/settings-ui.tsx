import { type ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { PANDAN, WARM_BEIGE } from '@/constants/brand';

export const CARD_SHADOW = {
  shadowColor: '#1C1916',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.05,
  shadowRadius: 16,
  elevation: 2,
} as const;

export function SettingsSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

export function SettingsRow({
  label,
  last = false,
  onPress,
  children,
}: {
  label: string;
  last?: boolean;
  onPress?: () => void;
  children: ReactNode;
}) {
  const row = (
    <View style={[styles.row, last && styles.rowLast]}>
      <Text style={styles.rowLabel}>{label}</Text>
      <View style={styles.rowTrailing}>{children}</View>
    </View>
  );

  if (!onPress) {
    return row;
  }

  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      {row}
    </Pressable>
  );
}

export function LinkRow({
  label,
  value,
  last = false,
  onPress,
  danger = false,
  chevron = true,
}: {
  label: string;
  value?: string;
  last?: boolean;
  onPress: () => void;
  danger?: boolean;
  chevron?: boolean;
}) {
  return (
    <Pressable onPress={onPress} style={({ pressed }) => pressed && styles.pressed}>
      <View style={[styles.row, last && styles.rowLast]}>
        <Text style={[styles.rowLabel, danger && styles.dangerText]}>{label}</Text>
        <View style={styles.rowTrailing}>
          {value ? <Text style={styles.rowValue}>{value}</Text> : null}
          {chevron && !danger ? <Text style={styles.chevron}>›</Text> : null}
        </View>
      </View>
    </Pressable>
  );
}

export function OptionPicker({
  visible,
  title,
  options,
  selected,
  onSelect,
  onClose,
}: {
  visible: boolean;
  title: string;
  options: readonly string[];
  selected: string;
  onSelect: (value: string) => void;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.modalRoot}>
        <Pressable style={styles.modalBackdrop} onPress={onClose} />
        <View style={styles.modalCard}>
          <Text style={styles.modalTitle}>{title}</Text>
          {options.map((option, index) => {
            const active = option === selected;
            return (
              <Pressable
                key={option}
                onPress={() => {
                  onSelect(option);
                  onClose();
                }}
                style={({ pressed }) => [
                  styles.modalRow,
                  index === options.length - 1 && styles.rowLast,
                  pressed && styles.pressed,
                ]}>
                <Text style={[styles.modalRowText, active && styles.modalRowTextActive]}>
                  {option}
                </Text>
                {active ? <Text style={styles.modalCheck}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
      </View>
    </Modal>
  );
}

export const settingsStyles = StyleSheet.create({
  flex: {
    flex: 1,
    backgroundColor: WARM_BEIGE,
  },
  screen: {
    flex: 1,
    backgroundColor: WARM_BEIGE,
    paddingHorizontal: 20,
  },
  rowInput: {
    minWidth: 72,
    maxWidth: 120,
    textAlign: 'right',
    color: '#8A847A',
    fontSize: 16,
    backgroundColor: '#F6F1EA',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  rowInputWide: {
    minWidth: 118,
    maxWidth: 160,
    textAlign: 'right',
    color: '#8A847A',
    fontSize: 16,
    backgroundColor: '#F6F1EA',
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 7,
  },
  rowValue: {
    color: '#9A958C',
    fontSize: 16,
  },
  chevron: {
    color: '#C4BEB5',
    fontSize: 22,
    lineHeight: 22,
    marginTop: -1,
  },
  generateButton: {
    borderRadius: 999,
    backgroundColor: PANDAN,
    paddingVertical: 15,
    alignItems: 'center',
  },
  generateButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  scienceText: {
    color: PANDAN,
    fontSize: 14,
    fontWeight: '500',
    textAlign: 'center',
  },
  pressed: {
    opacity: 0.72,
  },
});

const styles = StyleSheet.create({
  section: {
    marginBottom: 22,
  },
  sectionTitle: {
    color: '#8A847A',
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.2,
    paddingHorizontal: 4,
    marginBottom: 8,
  },
  card: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    ...CARD_SHADOW,
  },
  row: {
    minHeight: 54,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFEAE3',
  },
  rowLast: {
    borderBottomWidth: 0,
  },
  rowLabel: {
    flex: 1,
    color: '#2C2A26',
    fontSize: 16,
  },
  rowTrailing: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    maxWidth: '58%',
  },
  rowValue: {
    color: '#9A958C',
    fontSize: 16,
  },
  chevron: {
    color: '#C4BEB5',
    fontSize: 22,
    lineHeight: 22,
    marginTop: -1,
  },
  dangerText: {
    color: '#C45C4A',
    fontWeight: '500',
  },
  modalRoot: {
    flex: 1,
    justifyContent: 'center',
    paddingHorizontal: 28,
  },
  modalBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(28, 25, 22, 0.28)',
  },
  modalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    overflow: 'hidden',
    paddingTop: 8,
  },
  modalTitle: {
    color: '#8A847A',
    fontSize: 13,
    fontWeight: '600',
    paddingHorizontal: 18,
    paddingVertical: 12,
  },
  modalRow: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 18,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#EFEAE3',
  },
  modalRowText: {
    color: '#2C2A26',
    fontSize: 16,
  },
  modalRowTextActive: {
    color: PANDAN,
    fontWeight: '600',
  },
  modalCheck: {
    color: PANDAN,
    fontSize: 16,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.72,
  },
});
