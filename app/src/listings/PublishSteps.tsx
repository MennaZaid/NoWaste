// The steps between saving a Draft and publishing it (SRS 4.3.2): US-18, the estimated perishability category, set when
// the listing is saved and shown with its hours (D-70); the vendor does not change it (D-72: an earlier pickup end is
// the way to have food collected sooner); then US-19, the destinations with the top one marked Recommended, the
// unfit-for-people mark and the vendor's choice (FR-RTE-05 to FR-RTE-07, E-RTE-02).
// The category is shown as how soon to collect, never as a statement that the food is safe (IF-UI-05, NFR-05a).
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import {
  chooseDestination,
  getDestinations,
  markUnfit,
  type Destination,
  type Destinations,
  type Listing,
} from '@/api/client';
import { AppText } from '@/components/AppText';
import { Notice } from '@/components/Notice';
import { OptionList } from '@/components/OptionList';
import { colors, spacing } from '@/theme';
import { useCategoryHours } from './categoryHours';
import { categoryWithHours, destinationDescription, destinationOf } from './perishabilityText';

type Problem = 'unreachable' | 'unexpected' | 'notApproved';

interface PublishStepsProps {
  token: string;
  listing: Listing;
  onChange: (listing: Listing) => void;
  onSessionEnded: () => void;
}

export function PublishSteps({ token, listing, onChange, onSessionEnded }: PublishStepsProps) {
  const { t } = useTranslation();
  const hours = useCategoryHours();
  const [destinations, setDestinations] = useState<Destinations | null>(null);
  const [notEligible, setNotEligible] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);

  const ended = (kind: string) => kind === 'unauthorized' || kind === 'suspended';
  const category = listing.perishabilityCategory;

  // FR-RTE-05: the destinations, at once (a Draft saved before D-70 gets its estimate from the server, D-72), and
  // again when the unfit mark changes (FR-RTE-07).
  useEffect(() => {
    let active = true;
    void getDestinations(token, listing.id).then((result) => {
      if (!active) return;
      if (result.kind === 'ok') setDestinations(result.destinations);
      else if (ended(result.kind)) onSessionEnded();
      else
        setProblem(
          result.kind === 'notApproved' || result.kind === 'unreachable' ? result.kind : 'unexpected',
        );
    });
    return () => {
      active = false;
    };
  }, [token, listing.id, listing.unfitForPeople, onSessionEnded]);

  async function toggleUnfit() {
    setProblem(null);
    const result = await markUnfit(token, listing.id, !listing.unfitForPeople);
    if (result.kind === 'ok') onChange(result.listing);
    else if (ended(result.kind)) onSessionEnded();
    else
      setProblem(result.kind === 'notApproved' || result.kind === 'unreachable' ? result.kind : 'unexpected');
  }

  async function choose(destination: Destination) {
    setProblem(null);
    setNotEligible(false);
    const result = await chooseDestination(token, listing.id, destination);
    if (result.kind === 'ok') onChange(result.listing);
    else if (result.kind === 'notEligible') setNotEligible(true);
    else if (ended(result.kind)) onSessionEnded();
    else
      setProblem(result.kind === 'notApproved' || result.kind === 'unreachable' ? result.kind : 'unexpected');
  }

  return (
    <View testID="publish-steps" style={styles.steps}>
      {problem !== null ? <Notice tone="error" message={t(`listing.problems.${problem}`)} /> : null}

      <View testID="perishability-step" style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('perishability.title')}
        </AppText>
        {category !== null ? (
          <AppText testID="perishability-current" variant="label">
            {t('perishability.estimate', { category: categoryWithHours(t, category, hours) })}
          </AppText>
        ) : null}
        <AppText color="textMuted">{t('perishability.intro')}</AppText>
      </View>

      <View style={styles.section}>
        <AppText variant="heading" accessibilityRole="header">
          {t('routing.title')}
        </AppText>
        <OptionList<'unfit'>
          multiple
          label={t('routing.unfitGroup')}
          options={[{ value: 'unfit', label: t('routing.unfit') }]}
          selected={listing.unfitForPeople ? ['unfit'] : []}
          onToggle={() => void toggleUnfit()}
        />
        {destinations === null ? (
          problem === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : null
        ) : (
          <>
            {destinations.recommended === null ? (
              <Notice tone="info" message={t('routing.noRecommendation')} />
            ) : null}
            <OptionList<Destination>
              testID="destination-options"
              label={t('routing.groupLabel')}
              options={destinations.options.map((option) => ({
                value: option.destination,
                label: t(`routing.destinations.${option.destination}`),
                description: destinationDescription(t, option, destinations.recommended),
                disabled: !option.available,
              }))}
              selected={(() => {
                const current = destinationOf(listing.listingType);
                return current === null ? [] : [current];
              })()}
              onToggle={(destination) => void choose(destination)}
            />
            {notEligible ? <Notice tone="error" message={t('routing.notEligible')} /> : null}
          </>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  steps: {
    gap: spacing.xl,
  },
  section: {
    gap: spacing.md,
  },
});
