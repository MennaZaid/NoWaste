// US-43 (FR-TGI-06, D-114): a Zakat receipt: number, vendor, food, bags, amount, charity, date and status (Paid,
// Delivered or Refunded), in the reader's language. "Share as PDF" prints it with expo-print and opens the share sheet.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Stack, useLocalSearchParams } from 'expo-router';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import { useTranslation } from 'react-i18next';
import { getZakatReceipt, type ZakatReceipt } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime } from '@/listings/formatDateTime';
import { listingText } from '@/listings/listingText';
import { colors, radius, spacing } from '@/theme';
import { receiptHtml } from '@/zakat/receiptHtml';

export default function ZakatReceiptScreen() {
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [receipt, setReceipt] = useState<ZakatReceipt | null>(null);
  const [failed, setFailed] = useState(false);
  const [shareFailed, setShareFailed] = useState(false);
  const [sharing, setSharing] = useState(false);

  useEffect(() => {
    if (token === null || typeof id !== 'string') return;
    let active = true;
    void getZakatReceipt(token, id).then((result) => {
      if (!active) return;
      if (result.kind === 'ok') setReceipt(result.receipt);
      else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [token, id, signOut]);

  if (token === null) return <Redirect href="/" />;

  const food = (r: ZakatReceipt) =>
    listingText({ ...r, descriptionAr: null, descriptionEn: null, foodType: r.foodName }, language).name ??
    r.foodName;
  const values = (r: ZakatReceipt) => ({
    status: t(`zakat.statuses.${r.status}`),
    food: food(r),
    amount: t('listing.egp', { amount: r.amount }),
    date: formatDateTime(r.createdAt, language),
    delivered: r.deliveredAt === null ? null : formatDateTime(r.deliveredAt, language),
    refunded: r.refundedAt === null ? null : formatDateTime(r.refundedAt, language),
  });

  async function share(r: ZakatReceipt) {
    setShareFailed(false);
    setSharing(true);
    try {
      const html = receiptHtml(
        r,
        {
          title: t('zakat.receiptTitle'),
          number: t('zakat.number'),
          status: t('zakat.status'),
          vendor: t('zakat.vendor'),
          food: t('zakat.food'),
          bags: t('zakat.bags'),
          amount: t('zakat.amount'),
          charity: t('zakat.charity'),
          date: t('zakat.date'),
          delivered: t('zakat.delivered'),
          refunded: t('zakat.refunded'),
        },
        values(r),
        language,
      );
      const { uri } = await Print.printToFileAsync({ html });
      await Sharing.shareAsync(uri, { mimeType: 'application/pdf', dialogTitle: t('zakat.receiptTitle') });
    } catch {
      setShareFailed(true);
    } finally {
      setSharing(false);
    }
  }

  const row = (label: string, value: string, testID?: string) => (
    <View style={styles.row}>
      <AppText variant="caption" color="textMuted">
        {label}
      </AppText>
      <AppText testID={testID}>{value}</AppText>
    </View>
  );

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('zakat.receiptTitle') }} />
      <View testID="zakat-receipt" style={[styles.content, { direction }]}>
        {failed ? <Notice tone="error" message={t('zakat.failed')} /> : null}
        {receipt === null && !failed ? <ActivityIndicator color={colors.primary} /> : null}
        {receipt !== null ? (
          <>
            <View style={styles.box}>
              {row(t('zakat.number'), receipt.receiptNumber, 'zakat-receipt-number')}
              {row(t('zakat.status'), values(receipt).status, 'zakat-receipt-status')}
              {row(t('zakat.vendor'), receipt.shopName)}
              {row(t('zakat.food'), values(receipt).food)}
              {row(t('zakat.bags'), String(receipt.bags))}
              {row(t('zakat.amount'), values(receipt).amount)}
              {row(t('zakat.charity'), receipt.charityName)}
              {row(t('zakat.date'), values(receipt).date)}
              {receipt.deliveredAt !== null
                ? row(t('zakat.delivered'), values(receipt).delivered ?? '')
                : null}
              {receipt.refundedAt !== null ? row(t('zakat.refunded'), values(receipt).refunded ?? '') : null}
            </View>
            {shareFailed ? <Notice tone="error" message={t('zakat.shareFailed')} /> : null}
            <Button
              testID="zakat-share"
              variant="secondary"
              label={t('zakat.share')}
              busy={sharing}
              onPress={() => void share(receipt)}
            />
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
  box: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  row: {
    gap: spacing.xs,
  },
});
