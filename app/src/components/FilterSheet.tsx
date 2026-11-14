// D-88 (US-26): a pop-up sheet that slides up from the bottom of the screen with one filter control (distance, price
// or pickup time) and its buttons. Tapping outside the sheet or the back button closes it without applying anything.
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, StyleSheet, View } from 'react-native';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, radius, spacing } from '@/theme';
import { AppText } from './AppText';

interface FilterSheetProps {
  visible: boolean;
  title: string;
  /** Read by screen readers on the area outside the sheet, which closes it. */
  closeLabel: string;
  onClose: () => void;
  children: ReactNode;
  testID?: string;
}

export function FilterSheet({ visible, title, closeLabel, onClose, children, testID }: FilterSheetProps) {
  const { direction } = useLanguage();
  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={styles.fill}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          style={styles.backdrop}
          onPress={onClose}
        />
        <View testID={testID} style={[styles.sheet, { direction }]}>
          <AppText variant="heading" accessibilityRole="header">
            {title}
          </AppText>
          {children}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    end: 0,
    bottom: 0,
    start: 0,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderTopStartRadius: radius.lg,
    borderTopEndRadius: radius.lg,
    padding: spacing.lg,
    paddingBottom: spacing.xl,
    gap: spacing.md,
  },
});
