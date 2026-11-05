// Quick Post (US-11, FR-LST-02) for informal vendors: a photo, the name and description in Arabic or English (D-66,
// stored as written), the number of bags (a +/- counter, D-64), the price and the pickup start and end. The start is
// optional: without it the pickup starts when it is posted (D-43, D-75). The pickup is at the shop pin, and the listing
// is published at once and treated as Highly perishable. A failed photo upload keeps the values and offers Retry (E-LST-02).
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  FOOD_CATEGORIES,
  UNKNOWN,
  validateQuickPost,
  type ListingFoodCategory,
  type QuickPostField,
} from '@nowaste/shared';
import { createQuickPost } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CounterField } from '@/components/CounterField';
import { DateTimeField } from '@/components/DateTimeField';
import { Notice } from '@/components/Notice';
import { OptionList } from '@/components/OptionList';
import { PhotoPicker } from '@/components/PhotoPicker';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useLanguage } from '@/i18n/LanguageProvider';
import { textLanguageOf } from '@/listings/listingText';
import { parseAmount, pickupNoteFor, preparePhoto, type PickupNote } from '@/listings/formHelpers';
import { spacing } from '@/theme';

type Problem =
  | 'uploadFailed'
  | 'tooLarge'
  | 'notApproved'
  | 'formalVendor'
  | 'unreachable'
  | 'unexpected'
  | 'hoursRequired';

export default function QuickPostScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  // D-68: optional; it lets charities and composting partners that accept this food be offered it.
  const [foodCategory, setFoodCategory] = useState<ListingFoodCategory>(UNKNOWN);
  const [bags, setBags] = useState(1);
  const [price, setPrice] = useState('');
  // D-75: null = the pickup starts when it is posted ("Now").
  const [pickupStart, setPickupStart] = useState<string | null>(null);
  const [pickupEnd, setPickupEnd] = useState<string | null>(null);
  const [invalid, setInvalid] = useState<QuickPostField[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  // D-61 / D-62: a message from the server for the pickup end.
  const [pickupNote, setPickupNote] = useState<PickupNote | null>(null);
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
      name,
      description,
      // D-66: stored as written; the language is read from the text itself.
      language: textLanguageOf(`${name} ${description}`),
      foodCategory,
      bagsTotal: bags,
      price: parseAmount(price),
      pickupStart: pickupStart ?? undefined,
      pickupEnd: pickupEnd ?? undefined,
    };
  }

  async function post() {
    setProblem(null);
    setPickupNote(null);
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
        setPickupNote(pickupNoteFor(result, t, language));
        break;
      case 'afterExpiry':
        setPickupNote(pickupNoteFor(result, t, language));
        if (result.latestPickupEnd === undefined) setProblem('unexpected');
        break;
      case 'hoursRequired':
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

        {invalid.length > 0 || pickupNote !== null ? (
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
          testID="quick-name"
          label={t('listing.nameLabel')}
          placeholder={t('listing.namePlaceholder')}
          value={name}
          onChangeText={(text) => {
            setName(text);
            clear('name');
          }}
          error={err('name', 'listing.errors.name')}
        />
        <TextField
          testID="quick-description"
          label={t('listing.descriptionLabel')}
          value={description}
          onChangeText={(text) => {
            setDescription(text);
            clear('description');
          }}
          error={err('description', 'listing.errors.description')}
          multiline
        />
        <OptionList<ListingFoodCategory>
          testID="quick-categories"
          label={t('quickPost.categoryLabel')}
          options={[...FOOD_CATEGORIES, UNKNOWN].map((value) => ({
            value,
            label: value === UNKNOWN ? t('listing.unknown') : t(`foodCategories.${value}`),
          }))}
          selected={[foodCategory]}
          onToggle={(value) => {
            setFoodCategory(value);
            clear('foodCategory');
          }}
          error={err('foodCategory', 'listing.errors.foodCategory')}
        />
        <CounterField
          testID="quick-bags"
          label={t('listing.bagsLabel')}
          value={bags}
          min={1}
          onChange={(value) => {
            setBags(value);
            clear('bagsTotal');
          }}
          error={err('bagsTotal', 'listing.errors.bags')}
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
          testID="quick-pickup-start"
          label={t('listing.pickupStartLabel')}
          hint={t('quickPost.pickupStartHint')}
          emptyText={t('quickPost.now')}
          value={pickupStart}
          onChange={(iso) => {
            setPickupStart(iso);
            setPickupNote(null);
            clear('pickupStart');
            clear('pickupEnd');
          }}
          error={
            pickupNote?.field === 'pickupStart'
              ? pickupNote.message
              : err('pickupStart', 'quickPost.errors.pickupStart')
          }
        />
        <DateTimeField
          testID="quick-pickup-end"
          label={t('listing.pickupEndLabel')}
          hint={t('quickPost.pickupEndHint')}
          value={pickupEnd}
          onChange={(iso) => {
            setPickupEnd(iso);
            setPickupNote(null);
            clear('pickupEnd');
          }}
          error={
            pickupNote?.field === 'pickupEnd'
              ? pickupNote.message
              : err('pickupEnd', 'quickPost.errors.pickupEnd')
          }
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
  group: {
    gap: spacing.sm,
  },
});
