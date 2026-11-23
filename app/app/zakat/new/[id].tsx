// US-43 (FR-TGI-05, E-TGI-02, D-113, D-116): donate bags of an offer as Zakat. The consumer chooses how many bags and a
// charity that accepts the food, then pays by card with the pretend bank (D-99: the card goes only to the bank, which
// gives a one-time token). Approved: the receipt opens. A failed payment keeps nothing and says why.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, Stack, router, useLocalSearchParams } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { validateCardInput, type CardField } from '@nowaste/shared';
import {
  createCardToken,
  donateZakat,
  getOffer,
  getZakatCharities,
  type Offer,
  type ZakatCharity,
} from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CounterField } from '@/components/CounterField';
import { Notice } from '@/components/Notice';
import { OptionList } from '@/components/OptionList';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useLanguage } from '@/i18n/LanguageProvider';
import { listingText } from '@/listings/listingText';
import { colors, spacing } from '@/theme';

export default function ZakatDonateScreen() {
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [offer, setOffer] = useState<Offer | null>(null);
  const [charities, setCharities] = useState<ZakatCharity[] | null>(null);
  const [bags, setBags] = useState(1);
  const [charityId, setCharityId] = useState<string | null>(null);
  const [number, setNumber] = useState('');
  const [expiry, setExpiry] = useState('');
  const [cvv, setCvv] = useState('');
  const [invalid, setInvalid] = useState<CardField[]>([]);
  const [problem, setProblem] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (token === null || typeof id !== 'string') return;
    let active = true;
    void Promise.all([getOffer(token, id), getZakatCharities(token, id)]).then(
      ([offerResult, charityResult]) => {
        if (!active) return;
        if (offerResult.kind === 'unauthorized' || offerResult.kind === 'suspended') {
          void signOut();
          return;
        }
        if (offerResult.kind === 'ok') setOffer(offerResult.offer);
        else setProblem(t('zakat.notFound'));
        if (charityResult.kind === 'ok') setCharities(charityResult.charities);
        else setCharities([]);
      },
    );
    return () => {
      active = false;
    };
  }, [token, id, signOut, t]);

  if (token === null) return <Redirect href="/" />;
  const session = token;

  async function pay(current: Offer) {
    setProblem(null);
    if (charityId === null) {
      setProblem(t('zakat.chooseCharity'));
      return;
    }
    const card = { number, expiry, cvv };
    const checked = validateCardInput(card);
    if (!checked.ok) {
      setInvalid(checked.fields);
      return;
    }
    setInvalid([]);
    setBusy(true);
    const tokenResult = await createCardToken(session, card);
    if (tokenResult.kind !== 'ok') {
      setBusy(false);
      if (tokenResult.kind === 'invalidCard') setInvalid(tokenResult.fields);
      else if (tokenResult.kind === 'unauthorized' || tokenResult.kind === 'suspended') void signOut();
      else setProblem(t('payment.failed.other'));
      return;
    }
    const result = await donateZakat(session, current.id, {
      charityId,
      bags,
      paymentToken: tokenResult.token,
    });
    setBusy(false);
    switch (result.kind) {
      case 'ok':
        router.replace({ pathname: '/zakat/[id]', params: { id: result.receipt.id } });
        return;
      case 'paymentFailed':
        setProblem(t(`payment.failed.${result.reason}`));
        return;
      case 'notEnoughBags':
        setProblem(t('zakat.notEnoughBags'));
        return;
      case 'notFound':
        setProblem(t('zakat.notFound'));
        return;
      case 'unauthorized':
      case 'suspended':
        await signOut();
        return;
      default:
        setProblem(t('payment.failed.other'));
    }
  }

  const fieldError = (field: CardField, key: string) => (invalid.includes(field) ? t(key) : undefined);

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('zakat.title') }} />
      <View testID="zakat-form" style={[styles.content, { direction }]}>
        {offer === null || charities === null ? (
          problem === null ? (
            <ActivityIndicator color={colors.primary} />
          ) : null
        ) : (
          <>
            <AppText variant="heading" accessibilityRole="header">
              {listingText(offer, language).name ?? t('quickPost.title')}
            </AppText>
            <AppText color="textMuted">{offer.place.shopName}</AppText>
            <AppText>{t('zakat.intro')}</AppText>
            <CounterField
              testID="zakat-bags"
              label={t('zakat.bagsLabel')}
              value={bags}
              min={1}
              max={Math.max(1, offer.bagsAvailable)}
              onChange={setBags}
            />
            {charities.length === 0 ? (
              <Notice testID="zakat-no-charity" tone="info" message={t('zakat.noCharity')} />
            ) : (
              <OptionList<string>
                testID="zakat-charities"
                label={t('zakat.charityLabel')}
                options={charities.map((c) => ({
                  value: c.id,
                  label: c.name,
                  description: t('zakat.distance', { km: (c.distanceMeters / 1000).toFixed(1) }),
                }))}
                selected={charityId === null ? [] : [charityId]}
                onToggle={(value) => {
                  setCharityId(value);
                  setProblem(null);
                }}
              />
            )}
            <TextField
              testID="card-number"
              label={t('payment.number')}
              value={number}
              onChangeText={setNumber}
              keyboardType="number-pad"
              maxLength={9}
              autoComplete="off"
              error={fieldError('number', 'payment.numberInvalid')}
            />
            <TextField
              testID="card-expiry"
              label={t('payment.expiry')}
              placeholder="MM/YY"
              value={expiry}
              onChangeText={setExpiry}
              keyboardType="numbers-and-punctuation"
              maxLength={5}
              autoComplete="off"
              error={fieldError('expiry', 'payment.expiryInvalid')}
            />
            <TextField
              testID="card-cvv"
              label={t('payment.cvv')}
              password
              value={cvv}
              onChangeText={setCvv}
              keyboardType="number-pad"
              maxLength={3}
              autoComplete="off"
              error={fieldError('cvv', 'payment.cvvInvalid')}
            />
          </>
        )}
        {problem !== null ? <Notice testID="zakat-problem" tone="error" message={problem} /> : null}
        {offer !== null && charities !== null && charities.length > 0 ? (
          <Button
            testID="zakat-pay"
            label={t('zakat.pay', { amount: t('listing.egp', { amount: offer.price * bags }) })}
            busy={busy}
            busyLabel={t('zakat.paying')}
            onPress={() => void pay(offer)}
          />
        ) : null}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
});
