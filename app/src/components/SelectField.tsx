// A drop-down menu (decision D-64, for how the food is stored): the field shows the chosen option; tapping it opens
// the list of options, and choosing one closes it. Screen readers hear the label, the choice and each option's state
// (NFR-07a). The list follows the layout direction.
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, minTouchSize, radius, spacing } from '@/theme';

interface SelectFieldProps<T extends string> {
  label: string;
  placeholder: string;
  options: readonly { value: T; label: string }[];
  value: T | null;
  onChange: (value: T) => void;
  error?: string;
  hint?: string;
  testID?: string;
}

export function SelectField<T extends string>({
  label,
  placeholder,
  options,
  value,
  onChange,
  error,
  hint,
  testID,
}: SelectFieldProps<T>) {
  const { direction } = useLanguage();
  const [open, setOpen] = useState(false);
  const invalid = error !== undefined;
  const chosen = options.find((o) => o.value === value);

  return (
    <View style={styles.container}>
      <AppText variant="label">{label}</AppText>
      <Pressable
        testID={testID}
        accessibilityRole="button"
        accessibilityLabel={`${label}: ${chosen?.label ?? placeholder}`}
        accessibilityHint={invalid ? error : hint}
        accessibilityState={{ expanded: open }}
        onPress={() => {
          setOpen(true);
        }}
        style={[styles.box, invalid && styles.boxInvalid]}
      >
        <AppText color={chosen === undefined ? 'placeholder' : 'text'} style={styles.boxText}>
          {chosen?.label ?? placeholder}
        </AppText>
        <AppText color="textMuted" importantForAccessibility="no">
          ▾
        </AppText>
      </Pressable>
      {invalid ? (
        <AppText variant="caption" color="error" accessibilityLiveRegion="polite">
          {error}
        </AppText>
      ) : hint !== undefined ? (
        <AppText variant="caption" color="textMuted">
          {hint}
        </AppText>
      ) : null}
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setOpen(false);
        }}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={label}
          style={styles.backdrop}
          onPress={() => {
            setOpen(false);
          }}
        >
          <View
            style={[styles.sheet, { direction }]}
            accessibilityRole="radiogroup"
            accessibilityLabel={label}
          >
            <AppText variant="label" style={styles.sheetTitle}>
              {label}
            </AppText>
            {options.map((option) => {
              const selected = option.value === value;
              return (
                <Pressable
                  key={option.value}
                  testID={testID === undefined ? undefined : `${testID}-option-${option.value}`}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: selected }}
                  onPress={() => {
                    onChange(option.value);
                    setOpen(false);
                  }}
                  style={[styles.option, selected && styles.optionSelected]}
                >
                  <AppText>{option.label}</AppText>
                </Pressable>
              );
            })}
          </View>
        </Pressable>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  box: {
    minHeight: minTouchSize + 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: spacing.lg,
  },
  boxText: {
    flex: 1,
  },
  boxInvalid: {
    borderColor: colors.error,
    borderWidth: 2,
    backgroundColor: colors.errorBackground,
  },
  backdrop: {
    flex: 1,
    justifyContent: 'center',
    padding: spacing.xl,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    backgroundColor: colors.surface,
    borderRadius: radius.lg,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  sheetTitle: {
    marginBottom: spacing.sm,
  },
  option: {
    minHeight: minTouchSize,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radius.md,
  },
  optionSelected: {
    backgroundColor: colors.accent,
  },
});
