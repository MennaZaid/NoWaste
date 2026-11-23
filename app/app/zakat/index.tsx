// US-43 (FR-TGI-06): the consumer's Zakat receipts, the newest first; a card opens the receipt.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Redirect, Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getMyZakat, type ZakatReceipt } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime } from '@/listings/formatDateTime';
import { colors, minTouchSize, radius, spacing } from '@/theme';

export default function ZakatReceiptsScreen() {
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();
  const [receipts, setReceipts] = useState<ZakatReceipt[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (token === null) return;
    let active = true;
    void getMyZakat(token).then((result) => {
      if (!active) return;
      if (result.kind === 'ok') setReceipts(result.receipts);
      else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [token, signOut]);

  if (token === null) return <Redirect href="/" />;

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('zakat.receiptsTitle') }} />
      <View testID="zakat-receipts" style={[styles.content, { direction }]}>
        {failed ? <Notice tone="error" message={t('zakat.failed')} /> : null}
        {receipts === null && !failed ? <ActivityIndicator color={colors.primary} /> : null}
        {receipts !== null && receipts.length === 0 ? (
          <AppText color="textMuted">{t('zakat.receiptsEmpty')}</AppText>
        ) : null}
        {receipts?.map((receipt) => (
          <Pressable
            key={receipt.id}
            testID={`zakat-receipt-${receipt.id}`}
            accessibilityRole="button"
            onPress={() => {
              router.push({ pathname: '/zakat/[id]', params: { id: receipt.id } });
            }}
            style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          >
            <AppText variant="label">{receipt.receiptNumber}</AppText>
            <AppText>{`${receipt.charityName} · ${t('listing.egp', { amount: receipt.amount })}`}</AppText>
            <AppText>{t(`zakat.statuses.${receipt.status}`)}</AppText>
            <AppText color="textMuted">{formatDateTime(receipt.createdAt, language)}</AppText>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  card: {
    minHeight: minTouchSize,
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  pressed: {
    backgroundColor: colors.accent,
  },
});
