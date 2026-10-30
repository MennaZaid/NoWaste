// Quick Post (US-11, FR-LST-02) for informal vendors: only a photo, the number of bags, the price and the pickup end
// time. The pickup starts when it is posted, at the shop pin (decision D-43), and the listing is published at once and
// treated as Highly perishable. A failed photo upload keeps the values and offers Retry (E-LST-02).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { validateQuickPost, type QuickPostField } from '@nowaste/shared';
import { createQuickPost } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DateTimeField } from '@/components/DateTimeField';
import { Notice } from '@/components/Notice';
import { PhotoPicker } from '@/components/PhotoPicker';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useLanguage } from '@/i18n/LanguageProvider';
import { parseAmount, preparePhoto } from '@/listings/formHelpers';
import { spacing } from '@/theme';

type Problem = 'uploadFailed' | 'tooLarge' | 'notApproved' | 'formalVendor' | 'unreachable' | 'unexpected';

export default function QuickPostScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { direction } = useLanguage();
  const { token, signOut } = useAuth();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [bags, setBags] = useState('');
  const [price, setPrice] = useState('');
  const [pickupEnd, setPickupEnd] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<QuickPostField[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [posting, setPosting] = useState(false);

  if (token === null) return <Redirect href="/" />;
  const session = token;

  function clear(field: QuickPostField) {
    setInvalid((current) => current.filter((f) => f !== field));
    setProblem(null);
  }

  const err = (field: QuickPostField, key: string) => (invalid.includes(field) ? t(key) : undefined);

  function body(key: string) {
    return {
      photoKey: key,
      bagsTotal: parseAmount(bags),
      price: parseAmount(price),
      pickupEnd: pickupEnd ?? undefined,
    };
  }

  async function post() {
    setProblem(null);
    const check = validateQuickPost(body(photoUri === null ? '' : (photoKey ?? 'photo')), new Date());
    if (!check.ok) {
      setInvalid(check.fields);
      return;
    }
    setInvalid([]);
    setPosting(true);
    let key = photoKey;
    if (key === null && photoUri !== null) {
      const upload = await preparePhoto(session, photoUri);
      if (upload.kind !== 'ok') {
        setPosting(false);
        if (upload.kind === 'unauthorized' || upload.kind === 'suspended') {
          await signOut();
          return;
        }
        setProblem(upload.kind === 'failed' ? 'uploadFailed' : upload.kind);
        return;
      }
      key = upload.photoKey;
      setPhotoKey(key);
    }
    const result = await createQuickPost(session, body(key ?? ''));
    setPosting(false);
    switch (result.kind) {
      case 'ok':
        router.replace({ pathname: '/listings/[id]', params: { id: result.listing.id } });
        break;
      case 'invalid':
        setInvalid(result.fields as QuickPostField[]);
        break;
      case 'notApproved':
      case 'formalVendor':
      case 'unreachable':
        setProblem(result.kind);
        break;
      case 'unauthorized':
      case 'suspended':
        await signOut();
        break;
      default:
        setProblem('unexpected');
    }
  }

  return (
    <Screen scroll>
      <View testID="quick-post-form" style={[styles.form, { direction }]}>
        <AppText color="textMuted">{t('quickPost.intro')}</AppText>

        {invalid.length > 0 ? (
          <Notice testID="listing-errors" tone="error" title={t('errors.fixFields')} />
        ) : null}

        <PhotoPicker
          uri={photoUri}
          onPick={(uri) => {
            setPhotoUri(uri);
            setPhotoKey(null);
            clear('photoKey');
          }}
          error={err('photoKey', 'listing.errors.photo')}
        />
        <TextField
          testID="quick-bags"
          label={t('listing.bagsLabel')}
          value={bags}
          onChangeText={(text) => {
            setBags(text);
            clear('bagsTotal');
          }}
          error={err('bagsTotal', 'listing.errors.bags')}
          keyboardType="number-pad"
        />
        <TextField
          testID="quick-price"
          label={t('quickPost.priceLabel')}
          value={price}
          onChangeText={(text) => {
            setPrice(text);
            clear('price');
          }}
          error={err('price', 'quickPost.errors.price')}
          keyboardType="decimal-pad"
        />
        <DateTimeField
          testID="quick-pickup-end"
          label={t('listing.pickupEndLabel')}
          hint={t('quickPost.pickupEndHint')}
          value={pickupEnd}
          onChange={(iso) => {
            setPickupEnd(iso);
            clear('pickupEnd');
          }}
          error={err('pickupEnd', 'quickPost.errors.pickupEnd')}
        />

        {problem !== null ? (
          <Notice testID="listing-problem" tone="error" message={t(`listing.problems.${problem}`)}>
            {problem === 'uploadFailed' ? (
              <Button
                testID="listing-retry"
                variant="secondary"
                label={t('listing.retry')}
                onPress={() => void post()}
              />
            ) : null}
          </Notice>
        ) : null}

        <Button
          testID="quick-post-submit"
          label={t('quickPost.submit')}
          busyLabel={t('quickPost.submitting')}
          busy={posting}
          onPress={() => void post()}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
  },
});
