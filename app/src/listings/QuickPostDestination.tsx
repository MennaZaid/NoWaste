// D-68: after a Quick Post is published (for consumers, D-43), the informal vendor sees where the food could go, with
// the top destination marked Recommended (FR-RTE-05), and may send it to a charity or composting partner instead
// (FR-RTE-06) until the pickup ends (time left from the server). Partners are matched by the food category, so a Quick Post posted as Unknown
// only has Consumers; the screen says so.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  chooseDestination,
  getDestinations,
  type Destination,
  type Destinations,
  type Listing,
} from '@/api/client';
import { AppText } from '@/components/AppText';
import { Notice } from '@/components/Notice';
import { OptionList } from '@/components/OptionList';
import { colors, spacing } from '@/theme';
import { destinationDescription, destinationOf } from './perishabilityText';

type Problem = 'unreachable' | 'unexpected' | 'notApproved' | 'pickupEnded' | 'notEligible';

interface QuickPostDestinationProps {
  token: string;
  listing: Listing;
  onChange: (listing: Listing) => void;
  onSessionEnded: () => void;
}

export function QuickPostDestination({
  token,
  listing,
  onChange,
  onSessionEnded,
}: QuickPostDestinationProps) {
  const { t } = useTranslation();
  const [destinations, setDestinations] = useState<Destinations | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);

  useEffect(() => {
    let active = true;
    void getDestinations(token, listing.id).then((result) => {
      if (!active) return;
      if (result.kind === 'ok') setDestinations(result.destinations);
      else if (result.kind === 'unauthorized' || result.kind === 'suspended') onSessionEnded();
      else
        setProblem(
          result.kind === 'notApproved' || result.kind === 'unreachable' ? result.kind : 'unexpected',
        );
    });
    return () => {
      active = false;
    };
  }, [token, listing.id, onSessionEnded]);

  async function choose(destination: Destination) {
    setProblem(null);
    const result = await chooseDestination(token, listing.id, destination);
    if (result.kind === 'ok') onChange(result.listing);
    else if (result.kind === 'unauthorized' || result.kind === 'suspended') onSessionEnded();
    else if (
      result.kind === 'notEligible' ||
      result.kind === 'pickupEnded' ||
      result.kind === 'notApproved'
    ) {
      setProblem(result.kind);
    } else setProblem(result.kind === 'unreachable' ? 'unreachable' : 'unexpected');
  }

  const current = destinationOf(listing.listingType);

  return (
    <View testID="quick-post-destination" style={styles.section}>
      <AppText variant="heading" accessibilityRole="header">
        {t('routing.title')}
      </AppText>
      <AppText color="textMuted">{t('routing.quickPostIntro')}</AppText>
      {listing.foodCategory === 'unknown' ? (
        <AppText testID="quick-post-no-category" variant="caption" color="textMuted">
          {t('routing.quickPostNoCategory')}
        </AppText>
      ) : null}
      {problem !== null ? (
        <Notice
          tone="error"
          message={
            problem === 'notEligible'
              ? t('routing.notEligible')
              : problem === 'pickupEnded'
                ? t('routing.pickupEnded')
                : t(`listing.problems.${problem}`)
          }
        />
      ) : null}
      {destinations === null ? (
        problem === null ? (
          <ActivityIndicator color={colors.primary} />
        ) : null
      ) : destinations.timeLeftMinutes <= 0 ? (
        // The server measures the time left with its own clock (IF-COM-07).
        <Notice tone="info" message={t('routing.pickupEnded')} />
      ) : (
        <OptionList<Destination>
          testID="quick-post-destinations"
          label={t('routing.groupLabel')}
          options={destinations.options.map((option) => ({
            value: option.destination,
            label: t(`routing.destinations.${option.destination}`),
            description: destinationDescription(t, option, destinations.recommended),
            disabled: !option.available,
          }))}
          selected={current === null ? [] : [current]}
          onToggle={(destination) => {
            if (destination !== current) void choose(destination);
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: spacing.md,
  },
});
