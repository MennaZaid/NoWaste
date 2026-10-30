// A labelled date-and-time field for pickup times, preparation time and expiry (US-10, US-13). Tapping it opens the
// phone's own picker (@react-native-community/datetimepicker): one date-and-time picker on iOS, a date picker and
// then a time picker on Android. The value is an ISO 8601 time. Tests replace this component in jest.setup.ts.
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { AppText } from './AppText';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime } from '@/listings/formatDateTime';
import { colors, minTouchSize, radius, spacing } from '@/theme';

interface DateTimeFieldProps {
  label: string;
  /** ISO time, or null when nothing is chosen. */
  value: string | null;
  onChange: (iso: string) => void;
  error?: string;
  hint?: string;
  disabled?: boolean;
  testID?: string;
}

export function DateTimeField({
  label,
  value,
  onChange,
  error,
  hint,
  disabled = false,
  testID,
}: DateTimeFieldProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  // Android shows the date first, then the time; iOS shows both at once.
  const [step, setStep] = useState<'closed' | 'date' | 'time' | 'datetime'>('closed');
  const current = value === null ? new Date() : new Date(value);
  const invalid = error !== undefined;

  function picked(event: DateTimePickerEvent, chosen?: Date) {
    if (event.type !== 'set' || chosen === undefined) {
      setStep('closed');
      return;
    }
    if (step === 'date') {
      // Keep the chosen day and ask for the time.
      const next = new Date(current);
      next.setFullYear(chosen.getFullYear(), chosen.getMonth(), chosen.getDate());
      onChange(next.toISOString());
      setStep('time');
      return;
    }
    if (Platform.OS !== 'ios') setStep('closed');
    onChange(chosen.toISOString());
  }

  return (
    <View style={styles.container}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        testID={testID}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={invalid ? error : (hint ?? t('listing.pickTime'))}
        accessibilityState={{ disabled }}
        onPress={() => {
          setStep(Platform.OS === 'ios' ? (step === 'closed' ? 'datetime' : 'closed') : 'date');
        }}
        style={[styles.box, invalid && styles.boxInvalid, disabled && styles.boxDisabled]}
      >
        <AppText color={value === null || disabled ? 'placeholder' : 'text'}>
          {disabled
            ? t('listing.unknown')
            : value === null
              ? t('listing.pickTime')
              : formatDateTime(value, language)}
        </AppText>
      </Pressable>
      {step !== 'closed' && !disabled ? (
        <DateTimePicker
          value={current}
          mode={step}
          display={Platform.OS === 'ios' ? 'inline' : 'default'}
          onChange={picked}
          locale={language === 'ar' ? 'ar-EG' : 'en-GB'}
        />
      ) : null}
      {invalid ? (
        <AppText variant="caption" color="error" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint !== undefined ? (
        <AppText variant="caption" color="textMuted">
          {hint}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  box: {
    minHeight: minTouchSize + 4,
    justifyContent: 'center',
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  boxInvalid: {
    borderColor: colors.error,
    borderWidth: 2,
    backgroundColor: colors.errorBackground,
  },
  boxDisabled: {
    backgroundColor: colors.accent,
  },
});
