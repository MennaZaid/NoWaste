// Root of every screen: background colour, safe areas and the layout direction of the current language.
// Setting `direction` here mirrors every child that uses start/end styles and row layouts (IF-UI-03, NFR-06).
import type { ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View, type ViewStyle } from 'react-native';
import { SafeAreaView, type Edge } from 'react-native-safe-area-context';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, spacing } from '@/theme';

interface ScreenProps {
  children: ReactNode;
  /** Scrollable content with keyboard avoidance, for forms. */
  scroll?: boolean;
  /** Safe-area edges to pad. Screens with a navigation header only need the bottom edge. */
  edges?: Edge[];
  contentStyle?: ViewStyle;
  backgroundColor?: string;
  /** A bar drawn by the screen itself above the content, for screens without the navigation header (D-53). */
  header?: ReactNode;
}

export function Screen({
  children,
  scroll = false,
  edges = ['bottom'],
  contentStyle,
  backgroundColor = colors.background,
  header,
}: ScreenProps) {
  const { direction } = useLanguage();

  const content = scroll ? (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.flex}
        contentContainerStyle={[styles.scrollContent, contentStyle]}
        keyboardShouldPersistTaps="handled"
      >
        {children}
      </ScrollView>
    </KeyboardAvoidingView>
  ) : (
    <View style={[styles.flex, contentStyle]}>{children}</View>
  );

  return (
    <SafeAreaView edges={edges} style={[styles.flex, { backgroundColor, direction }]}>
      <View testID="screen-root" style={[styles.flex, { direction }]}>
        {header}
        {content}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    padding: spacing.xl,
    gap: spacing.lg,
  },
});
