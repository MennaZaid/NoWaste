// A vertical list of options: "single" is a radio group (account type), "multiple" is a checklist (accepted food
// types). Each row is a full-width touch target, and screen readers hear the role and whether it is chosen (NFR-07a).
// Rows follow the layout direction, so in Arabic the mark sits on the right.
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from './AppText';
import { colors, minTouchSize, radius, spacing } from '@/theme';

export interface ListOption<T extends string> {
  value: T;
  label: string;
  description?: string;
}

interface OptionListProps<T extends string> {
  options: readonly ListOption<T>[];
  selected: readonly T[];
  onToggle: (value: T) => void;
  multiple?: boolean;
  label: string;
  error?: string;
  testID?: string;
}

export function OptionList<T extends string>({
  options,
  selected,
  onToggle,
  multiple = false,
  label,
  error,
  testID,
}: OptionListProps<T>) {
  const invalid = error !== undefined;
  return (
    <View style={styles.container}>
      <AppText variant="label">{label}</AppText>
      <View
        testID={testID}
        accessibilityRole={multiple ? 'list' : 'radiogroup'}
        accessibilityLabel={label}
        style={[styles.list, invalid && styles.listInvalid]}
      >
        {options.map((option) => {
          const checked = selected.includes(option.value);
          return (
            <Pressable
              key={option.value}
              onPress={() => {
                onToggle(option.value);
              }}
              accessibilityRole={multiple ? 'checkbox' : 'radio'}
              accessibilityLabel={option.label}
              accessibilityHint={option.description}
              accessibilityState={{ checked }}
              style={({ pressed }) => [styles.row, checked && styles.rowChecked, pressed && styles.pressed]}
            >
              <View style={[multiple ? styles.box : styles.circle, checked && styles.markChecked]}>
                {checked ? (
                  <AppText variant="caption" color="onPrimary" center style={styles.tick}>
                    {multiple ? '✓' : '●'}
                  </AppText>
                ) : null}
              </View>
              <View style={styles.text}>
                <AppText variant="label">{option.label}</AppText>
                {option.description !== undefined ? (
                  <AppText variant="caption" color="textMuted">
                    {option.description}
                  </AppText>
                ) : null}
              </View>
            </Pressable>
          );
        })}
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
  list: {
    gap: spacing.sm,
  },
  listInvalid: {
    borderStartWidth: 3,
    borderColor: colors.error,
    paddingStart: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: minTouchSize,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1.5,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  rowChecked: {
    borderColor: colors.primary,
    backgroundColor: colors.accent,
  },
  pressed: {
    opacity: 0.75,
  },
  box: {
    width: 22,
    height: 22,
    borderRadius: radius.sm / 2,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
  },
  circle: {
    width: 22,
    height: 22,
    borderRadius: radius.pill,
    borderWidth: 2,
    borderColor: colors.primary,
    justifyContent: 'center',
  },
  markChecked: {
    backgroundColor: colors.primary,
  },
  tick: {
    lineHeight: 18,
    fontWeight: '700',
  },
  text: {
    flex: 1,
    gap: 2,
  },
});
