// Create listing (US-10, FR-LST-01) with preparation time, storage and expiry (US-13, FR-LST-04). Sprint 1 has no AI,
// so the vendor types the food type, category and both descriptions (the manual path of E-LST-01 and NFR-03); the
// AI draft (US-12) fills the same fields in Sprint 2. The pickup location starts at the shop pin and can be moved
// (docs/feedback-changes.md). Saving compresses and uploads the photo (NFR-08a, C-26); if the upload fails the form
// keeps every value and offers Retry (E-LST-02). Invalid fields are marked (E-LST-04, IF-UI-06) and a pickup end after
// the expiry is refused (E-LST-03, NFR-05c). The listing is saved as a Draft and published on the next screen.
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  FOOD_CATEGORIES,
  STORAGE_CONDITIONS,
  UNKNOWN,
  validateListing,
  type ListingField,
  type ListingFoodCategory,
  type StorageCondition,
} from '@nowaste/shared';
import { createListing, getShop, type ListingRequest } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { DateTimeField } from '@/components/DateTimeField';
import { MapView, type Coordinates } from '@/components/MapView';
import { Notice } from '@/components/Notice';
import { OptionList } from '@/components/OptionList';
import { PhotoPicker } from '@/components/PhotoPicker';
import { Screen } from '@/components/Screen';
import { TextField } from '@/components/TextField';
import { useLanguage } from '@/i18n/LanguageProvider';
import { parseAmount, preparePhoto } from '@/listings/formHelpers';
import { spacing } from '@/theme';

type Problem = 'uploadFailed' | 'tooLarge' | 'notApproved' | 'unreachable' | 'unexpected';

const CATEGORIES: readonly ListingFoodCategory[] = [...FOOD_CATEGORIES, UNKNOWN];

export default function NewListingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { direction } = useLanguage();
  const { token, signOut } = useAuth();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  // Kept after a successful upload, so Retry and a second save do not upload again.
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [foodType, setFoodType] = useState('');
  const [foodCategory, setFoodCategory] = useState<ListingFoodCategory | null>(null);
  const [descriptionAr, setDescriptionAr] = useState('');
  const [descriptionEn, setDescriptionEn] = useState('');
  const [bags, setBags] = useState('');
  const [originalValue, setOriginalValue] = useState('');
  const [price, setPrice] = useState('');
  const [pickupStart, setPickupStart] = useState<string | null>(null);
  const [pickupEnd, setPickupEnd] = useState<string | null>(null);
  const [prepTime, setPrepTime] = useState<string | null>(null);
  const [prepUnknown, setPrepUnknown] = useState(false);
  const [storage, setStorage] = useState<StorageCondition | null>(null);
  const [expiryAt, setExpiryAt] = useState<string | null>(null);
  const [expiryUnknown, setExpiryUnknown] = useState(false);
  const [shopPin, setShopPin] = useState<Coordinates | null>(null);
  const [pin, setPin] = useState<Coordinates | null>(null);

  const [invalid, setInvalid] = useState<ListingField[]>([]);
  const [afterExpiry, setAfterExpiry] = useState(false);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (token === null) return;
    let active = true;
    void getShop(token)
      .then((result) => {
        if (active && result.kind === 'ok') {
          const here = { latitude: result.shop.latitude, longitude: result.shop.longitude };
          setShopPin(here);
          setPin((current) => current ?? here);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token]);

  if (token === null) return <Redirect href="/" />;
  const session = token;

  function clear(...fields: ListingField[]) {
    setInvalid((current) => current.filter((f) => !fields.includes(f)));
    setProblem(null);
  }

  const err = (field: ListingField, key: string) => (invalid.includes(field) ? t(key) : undefined);

  function body(key: string): ListingRequest {
    // The pin is sent only when the vendor moved it; otherwise the server uses the shop pin.
    const moved =
      pin !== null &&
      (shopPin === null || pin.latitude !== shopPin.latitude || pin.longitude !== shopPin.longitude);
    return {
      photoKey: key,
      foodType,
      foodCategory: foodCategory ?? ('' as ListingFoodCategory),
      descriptionAr,
      descriptionEn,
      bagsTotal: parseAmount(bags),
      originalValue: parseAmount(originalValue),
      price: parseAmount(price),
      pickupStart: pickupStart ?? undefined,
      pickupEnd: pickupEnd ?? undefined,
      prepTime: prepUnknown ? UNKNOWN : (prepTime ?? undefined),
      storage: storage ?? undefined,
      expiryAt: expiryUnknown ? UNKNOWN : (expiryAt ?? undefined),
      location: moved ? pin : undefined,
    };
  }

  async function save() {
    setProblem(null);
    setAfterExpiry(false);
    // Checked before the upload, so nothing is sent while a field is wrong. A placeholder stands for the photo key.
    const check = validateListing(body(photoUri === null ? '' : (photoKey ?? 'photo')));
    if (!check.ok) {
      if (check.error === 'E-LST-03') {
        setInvalid([]);
        setAfterExpiry(true);
      } else {
        setInvalid(check.fields);
      }
      return;
    }
    setInvalid([]);
    setSaving(true);
    let key = photoKey;
    if (key === null && photoUri !== null) {
      const upload = await preparePhoto(session, photoUri);
      if (upload.kind !== 'ok') {
        setSaving(false);
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
    const result = await createListing(session, body(key ?? ''));
    setSaving(false);
    switch (result.kind) {
      case 'ok':
        router.replace({ pathname: '/listings/[id]', params: { id: result.listing.id } });
        break;
      case 'invalid':
        setInvalid(result.fields as ListingField[]);
        break;
      case 'afterExpiry':
        setAfterExpiry(true);
        break;
      case 'notApproved':
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
      <View testID="listing-form" style={[styles.form, { direction }]}>
        <AppText color="textMuted">{t('listing.intro')}</AppText>

        {invalid.length > 0 || afterExpiry ? (
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
          testID="listing-food-type"
          label={t('listing.foodTypeLabel')}
          placeholder={t('listing.foodTypePlaceholder')}
          value={foodType}
          onChangeText={(text) => {
            setFoodType(text);
            clear('foodType');
          }}
          error={err('foodType', 'listing.errors.foodType')}
        />

        <OptionList<ListingFoodCategory>
          testID="listing-categories"
          label={t('listing.categoryLabel')}
          options={CATEGORIES.map((value) => ({
            value,
            label: value === UNKNOWN ? t('listing.unknown') : t(`foodCategories.${value}`),
          }))}
          selected={foodCategory === null ? [] : [foodCategory]}
          onToggle={(value) => {
            setFoodCategory(value);
            clear('foodCategory');
          }}
          error={err('foodCategory', 'listing.errors.foodCategory')}
        />

        <TextField
          testID="listing-description-ar"
          label={t('listing.descriptionArLabel')}
          value={descriptionAr}
          onChangeText={(text) => {
            setDescriptionAr(text);
            clear('descriptionAr');
          }}
          error={err('descriptionAr', 'listing.errors.descriptionAr')}
          multiline
        />
        <TextField
          testID="listing-description-en"
          label={t('listing.descriptionEnLabel')}
          value={descriptionEn}
          onChangeText={(text) => {
            setDescriptionEn(text);
            clear('descriptionEn');
          }}
          error={err('descriptionEn', 'listing.errors.descriptionEn')}
          multiline
        />

        <TextField
          testID="listing-bags"
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
          testID="listing-original-value"
          label={t('listing.originalValueLabel')}
          value={originalValue}
          onChangeText={(text) => {
            setOriginalValue(text);
            clear('originalValue', 'price');
          }}
          error={err('originalValue', 'listing.errors.originalValue')}
          keyboardType="decimal-pad"
        />
        <TextField
          testID="listing-price"
          label={t('listing.priceLabel')}
          hint={t('listing.priceHint')}
          value={price}
          onChangeText={(text) => {
            setPrice(text);
            clear('price');
          }}
          error={err('price', 'listing.errors.price')}
          keyboardType="decimal-pad"
        />

        <DateTimeField
          testID="listing-pickup-start"
          label={t('listing.pickupStartLabel')}
          value={pickupStart}
          onChange={(iso) => {
            setPickupStart(iso);
            clear('pickupStart', 'pickupEnd');
          }}
          error={err('pickupStart', 'listing.errors.pickupStart')}
        />
        <DateTimeField
          testID="listing-pickup-end"
          label={t('listing.pickupEndLabel')}
          value={pickupEnd}
          onChange={(iso) => {
            setPickupEnd(iso);
            setAfterExpiry(false);
            clear('pickupEnd');
          }}
          error={afterExpiry ? t('listing.errors.afterExpiry') : err('pickupEnd', 'listing.errors.pickupEnd')}
        />

        <AppText variant="heading" accessibilityRole="header">
          {t('listing.safetySection')}
        </AppText>
        <AppText variant="caption" color="textMuted">
          {t('listing.safetyHint')}
        </AppText>

        <DateTimeField
          testID="listing-prep-time"
          label={t('listing.prepTimeLabel')}
          value={prepTime}
          disabled={prepUnknown}
          onChange={(iso) => {
            setPrepTime(iso);
            clear('prepTime');
          }}
          error={err('prepTime', 'listing.errors.prepTime')}
        />
        <OptionList<'unknown'>
          multiple
          label={t('listing.prepUnknownGroup')}
          options={[{ value: 'unknown', label: t('listing.prepUnknown') }]}
          selected={prepUnknown ? ['unknown'] : []}
          onToggle={() => {
            setPrepUnknown((value) => !value);
            clear('prepTime');
          }}
        />

        <OptionList<StorageCondition>
          testID="listing-storage"
          label={t('listing.storageLabel')}
          options={STORAGE_CONDITIONS.map((value) => ({ value, label: t(`listing.storage.${value}`) }))}
          selected={storage === null ? [] : [storage]}
          onToggle={(value) => {
            setStorage(value);
            clear('storage');
          }}
          error={err('storage', 'listing.errors.storage')}
        />

        <DateTimeField
          testID="listing-expiry"
          label={t('listing.expiryLabel')}
          hint={t('listing.expiryHint')}
          value={expiryAt}
          disabled={expiryUnknown}
          onChange={(iso) => {
            setExpiryAt(iso);
            setAfterExpiry(false);
            clear('expiryAt');
          }}
          error={err('expiryAt', 'listing.errors.expiry')}
        />
        <OptionList<'unknown'>
          multiple
          label={t('listing.expiryUnknownGroup')}
          options={[{ value: 'unknown', label: t('listing.expiryUnknown') }]}
          selected={expiryUnknown ? ['unknown'] : []}
          onToggle={() => {
            setExpiryUnknown((value) => !value);
            setAfterExpiry(false);
            clear('expiryAt');
          }}
        />

        <View style={styles.group}>
          <AppText variant="label">{t('listing.locationLabel')}</AppText>
          <AppText variant="caption" color={invalid.includes('location') ? 'error' : 'textMuted'}>
            {invalid.includes('location') ? t('listing.errors.location') : t('listing.locationHint')}
          </AppText>
          {shopPin !== null ? (
            <MapView
              testID="listing-map"
              center={shopPin}
              pin={pin}
              onPinChange={(next) => {
                setPin(next);
                clear('location');
              }}
              accessibilityLabel={t('location.mapLabel')}
            />
          ) : null}
        </View>

        {problem !== null ? (
          <Notice testID="listing-problem" tone="error" message={t(`listing.problems.${problem}`)}>
            {problem === 'uploadFailed' ? (
              <Button
                testID="listing-retry"
                variant="secondary"
                label={t('listing.retry')}
                onPress={() => void save()}
              />
            ) : null}
          </Notice>
        ) : null}

        <Button
          testID="listing-save"
          label={t('listing.save')}
          busyLabel={t('listing.saving')}
          busy={saving}
          onPress={() => void save()}
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
