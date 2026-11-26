// US-25 Landfill record (FR-RTE-13, decision D-117) on the vendor's listing page: once the pickup window has ended and
// bags were not taken, the vendor may record them as sent to landfill (the last resort, FR-RTE-05) so they count in
// the impact numbers (US-44). The server checks again that no charity or composting partner took the food.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { recordLandfill, type LandfillRecord, type Listing } from '@/api/client';
import { spacing } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Notice } from './Notice';

const REASONS = [
  'pickup_not_ended',
  'landfill_already_recorded',
  'taken_by_partner',
  'nothing_left',
  'listing_not_published',
];

/** Whether the listing page shows the landfill section at all. */
export function showsLandfill(listing: Listing, now: number): boolean {
  if (listing.landfill != null) return true;
  return (
    listing.status !== 'Draft' &&
    listing.status !== 'Cancelled' &&
    Date.parse(listing.pickupEnd) <= now &&
    listing.bagsAvailable > 0
  );
}

interface LandfillSectionProps {
  token: string;
  listing: Listing;
  onSessionEnded: () => void;
}

export function LandfillSection({ token, listing, onSessionEnded }: LandfillSectionProps) {
  const { t } = useTranslation();
  const [record, setRecord] = useState<LandfillRecord | null>(listing.landfill ?? null);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);

  async function save() {
    setProblem(null);
    setBusy(true);
    const result = await recordLandfill(token, listing.id);
    setBusy(false);
    if (result.kind === 'ok') setRecord(result.record);
    else if (result.kind === 'unauthorized' || result.kind === 'suspended') onSessionEnded();
    else if (result.kind === 'refused' && REASONS.includes(result.reason)) setProblem(result.reason);
    else setProblem('failed');
  }

  return (
    <View testID="landfill" style={styles.box}>
      <AppText variant="label">{t('landfill.title')}</AppText>
      {record !== null ? (
        <AppText>{t('landfill.recorded', { count: record.bags })}</AppText>
      ) : (
        <>
          <AppText>{t('landfill.intro', { count: listing.bagsAvailable })}</AppText>
          {problem !== null ? <Notice tone="error" message={t(`landfill.errors.${problem}`)} /> : null}
          <Button
            testID="landfill-record"
            variant="secondary"
            label={t('landfill.record')}
            busy={busy}
            busyLabel={t('landfill.recording')}
            onPress={() => void save()}
          />
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
  },
});
