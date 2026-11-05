// A labelled time-of-day field for shop opening hours (decision D-62). Tapping it opens the phone's own clock
// (@react-native-community/datetimepicker, 24-hour); the value is "HH:MM". Tests replace this component in
// jest.setup.ts.
import { useState } from 'react';
import { Platform, Pressable, StyleSheet, View } from 'react-native';
import DateTimePicker, { type DateTimePickerEvent } from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { AppText } from './AppText';
import { localDigits } from '@/i18n/digits';
import { useLanguage } from '@/i18n/LanguageProvider';
import { clockTimeOf, dateAtClockTime } from '@/listings/clockTime';
import { colors, minTouchSize, radius, spacing } from '@/theme';

interface TimeFieldProps {
  label: string;
  /** "HH:MM", or null when nothing is chosen. */
  value: string | null;
  onChange: (time: string) => void;
  error?: string;
  hint?: string;
  testID?: string;
}

export function TimeField({ label, value, onChange, error, hint, testID }: TimeFieldProps) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [open, setOpen] = useState(false);
  const invalid = error !== undefined;

  function picked(event: DateTimePickerEvent, chosen?: Date) {
    // Android closes its dialog after each answer; iOS keeps the inline clock until the field is tapped again.
    if (Platform.OS !== 'ios') setOpen(false);
    if (event.type === 'set' && chosen !== undefined) onChange(clockTimeOf(chosen));
  }

  return (
    <View style={styles.container}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={label}
        accessibilityHint={invalid ? error : (hint ?? t('openingHours.pickTime'))}
        onPress={() => {
          setOpen((current) => (Platform.OS === 'ios' ? !current : true));
        }}
        style={[styles.box, invalid && styles.boxInvalid]}
      >
        <AppText color={value === null ? 'placeholder' : 'text'}>
          {value === null ? t('openingHours.pickTime') : localDigits(value, language)}
        </AppText>
      </Pressable>
      {open ? (
        <DateTimePicker
          value={dateAtClockTime(value)}
          mode="time"
          is24Hour
          display={Platform.OS === 'ios' ? 'spinner' : 'default'}
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
});
