// US-12 (NFR-05a, NFR-05b): under a field the AI filled, the "Draft (AI)" label and a Confirm button; once the vendor
// confirms or edits the field it says Confirmed.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { AppText } from './AppText';
import { Button } from './Button';
import { spacing } from '@/theme';

interface AiMarkProps {
  testID: string;
  confirmed: boolean;
  onConfirm: () => void;
}

export function AiMark({ testID, confirmed, onConfirm }: AiMarkProps) {
  const { t } = useTranslation();
  return (
    <View testID={testID} style={styles.row}>
      <AppText variant="caption" color="textMuted">
        {t('aiDraft.draftTag')}
      </AppText>
      {confirmed ? (
        <AppText variant="caption" color="primary">
          {t('aiDraft.confirmed')}
        </AppText>
      ) : (
        <Button
          testID={`${testID}-confirm`}
          variant="secondary"
          label={t('aiDraft.confirm')}
          onPress={onConfirm}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
});
