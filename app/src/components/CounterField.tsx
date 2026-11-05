// A whole-number counter, "+  value  −" (decision D-64, for the number of bags). The buttons are full-size touch
// targets and screen readers hear the label and the current value (NFR-07a). The row follows the layout direction.
import { Pressable, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localDigits } from '@/i18n/digits';
import { useLanguage } from '@/i18n/LanguageProvider';
import { AppText } from './AppText';
import { colors, minTouchSize, radius, spacing } from '@/theme';

interface CounterFieldProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  /** The smallest value; the minus button is disabled there. */
  min: number;
  error?: string;
  testID?: string;
}

// Drawn smaller than a normal field (asked for on 2026-11-04); the touch area stays minTouchSize (NFR-07a).
const SIZE = 36;
const SLOP = (minTouchSize - SIZE) / 2;

export function CounterField({ label, value, onChange, min, error, testID }: CounterFieldProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const shown = localDigits(value, language);
  const invalid = error !== undefined;
  const atMin = value <= min;

  return (
    <View style={styles.container}>
      <AppText variant="label">{label}</AppText>
      <View style={styles.row}>
        <Pressable
          testID={testID === undefined ? undefined : `${testID}-plus`}
          accessibilityRole="button"
          accessibilityLabel={t('counter.increase', { label })}
          hitSlop={SLOP}
          onPress={() => {
            onChange(value + 1);
          }}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <AppText variant="label" color="onPrimary">
            +
          </AppText>
        </Pressable>
        <View
          testID={testID}
          accessible
          accessibilityRole="text"
          accessibilityLabel={`${label}: ${shown}`}
          style={[styles.value, invalid && styles.valueInvalid]}
        >
          <AppText variant="label">{shown}</AppText>
        </View>
        <Pressable
          testID={testID === undefined ? undefined : `${testID}-minus`}
          accessibilityRole="button"
          accessibilityLabel={t('counter.decrease', { label })}
          accessibilityState={{ disabled: atMin }}
          disabled={atMin}
          hitSlop={SLOP}
          onPress={() => {
            onChange(Math.max(min, value - 1));
          }}
          style={({ pressed }) => [styles.button, atMin && styles.disabled, pressed && styles.pressed]}
        >
          <AppText variant="label" color="onPrimary">
            −
          </AppText>
        </Pressable>
      </View>
      {invalid ? (
        <AppText variant="caption" color="error" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.md,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    backgroundColor: colors.primaryPressed,
  },
  disabled: {
    opacity: 0.4,
  },
  value: {
    minWidth: SIZE * 1.5,
    height: SIZE,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  valueInvalid: {
    borderColor: colors.error,
    borderWidth: 2,
    backgroundColor: colors.errorBackground,
  },
});
