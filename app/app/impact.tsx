// US-44 Impact numbers (FR-TGI-07, decision D-118): every user sees meals rescued, money saved, estimated CO2 avoided,
// and the bags composted and sent to landfill, platform-wide and for their own account (the administrator has no own
// numbers). CO2 avoided is always labelled Estimate (NFR-05a). Numbers follow the language (NFR-06, D-67).
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getImpact, type Impact, type ImpactView } from '@/api/client';
import { roleGroupOf, useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { localDigits } from '@/i18n/digits';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, radius, spacing } from '@/theme';

function Stat({ testID, label, value }: { testID: string; label: string; value: string }) {
  return (
    <View testID={testID} style={styles.stat}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText variant="heading">{value}</AppText>
    </View>
  );
}

function Section({ scope, title, impact }: { scope: 'platform' | 'mine'; title: string; impact: Impact }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const id = (name: string) => `impact-${scope}-${name}`;
  return (
    <View testID={`impact-${scope}`} style={styles.section}>
      <AppText variant="heading" accessibilityRole="header">
        {title}
      </AppText>
      <Stat
        testID={id('meals')}
        label={t('impact.meals')}
        value={localDigits(impact.mealsRescued, language)}
      />
      <Stat
        testID={id('money')}
        label={t('impact.money')}
        value={t('listing.egp', { amount: impact.moneySaved })}
      />
      <Stat
        testID={id('co2')}
        label={t('impact.co2')}
        value={t('impact.co2Value', { kg: impact.co2AvoidedKg })}
      />
      <Stat
        testID={id('composted')}
        label={t('impact.composted')}
        value={localDigits(impact.bagsComposted, language)}
      />
      <Stat
        testID={id('landfill')}
        label={t('impact.landfill')}
        value={localDigits(impact.bagsLandfill, language)}
      />
    </View>
  );
}

export default function ImpactScreen() {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const { token, user, signOut } = useAuth();
  const [impact, setImpact] = useState<ImpactView | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (token === null) return undefined;
    let active = true;
    void getImpact(token).then((result) => {
      if (!active) return;
      if (result.kind === 'ok') setImpact(result.impact);
      else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [token, signOut]);

  if (token === null) return <Redirect href="/" />;
  const isAdmin = user !== null && roleGroupOf(user.role) === 'admin';

  return (
    <Screen scroll>
      <View testID="impact-screen" style={[styles.content, { direction }]}>
        {failed ? <Notice tone="error" message={t('impact.loadFailed')} /> : null}
        {impact === null && !failed ? <ActivityIndicator color={colors.primary} /> : null}
        {impact !== null ? (
          <>
            {isAdmin ? null : <Section scope="mine" title={t('impact.mine')} impact={impact.mine} />}
            <Section scope="platform" title={t('impact.platform')} impact={impact.platform} />
            <AppText variant="caption" color="textMuted">
              {t('impact.co2Note', { kg: impact.co2KgPerBag })}
            </AppText>
          </>
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
  section: {
    gap: spacing.sm,
    padding: spacing.md,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
  },
  stat: {
    gap: 2,
  },
});
