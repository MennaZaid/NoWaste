// US-16 (FR-LST-07, IF-UI-04, NFR-05a, decision D-119): in the listing and Quick Post forms, the AI's estimated
// calories per bag, labelled Estimate, with Remove (the estimate is not published) and Show estimate (undo).
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { spacing } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';

interface CalorieEstimateProps {
  range: { min: number; max: number };
  kept: boolean;
  onChange: (kept: boolean) => void;
}

export function CalorieEstimate({ range, kept, onChange }: CalorieEstimateProps) {
  const { t } = useTranslation();
  return (
    <View testID="calorie-estimate" style={styles.box}>
      <AppText variant="label">{t('calories.label')}</AppText>
      {kept ? (
        <>
          <AppText>{t('calories.estimate', { min: range.min, max: range.max })}</AppText>
          <AppText variant="caption" color="textMuted">
            {t('calories.formNote')}
          </AppText>
        </>
      ) : (
        <AppText color="textMuted">{t('calories.removed')}</AppText>
      )}
      <Button
        testID={kept ? 'calorie-remove' : 'calorie-keep'}
        variant="secondary"
        label={kept ? t('calories.remove') : t('calories.keep')}
        onPress={() => {
          onChange(!kept);
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.xs,
  },
});
