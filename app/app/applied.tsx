// Shown after a vendor (US-02) or partner (US-03) application is sent: the account is Pending until an administrator
// reviews it (FR-ACC-02, FR-ACC-03; approval is US-07). Logging in to see the status is US-04.
import { StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Logo } from '@/components/Logo';
import { Screen } from '@/components/Screen';
import { spacing } from '@/theme';

export default function AppliedScreen() {
  const { t } = useTranslation();
  const router = useRouter();

  return (
    <Screen contentStyle={styles.content}>
      <View style={styles.center}>
        <Logo width={120} />
        <AppText testID="applied-title" variant="heading" center accessibilityRole="header">
          {t('applied.title')}
        </AppText>
        <AppText center>{t('applied.message')}</AppText>
        <AppText variant="caption" color="textMuted" center>
          {t('applied.next')}
        </AppText>
      </View>
      <Button
        label={t('applied.backToStart')}
        onPress={() => {
          router.dismissTo('/');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: spacing.xl,
    justifyContent: 'space-between',
  },
  center: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: spacing.md,
  },
});
