// Create listing (US-10, FR-LST-01, US-13 / FR-LST-04 as changed by D-63 and D-64), for formal vendors only. The vendor
// writes the name and description once, in Arabic or English; they are shown as written, not translated (D-66). The number of bags is
// a +/− counter, storage is a drop-down, and the vendor picks the pickup start and one of their branches. Preparation
// time and expiry are no longer asked: the pick-by time is worked out by the server (pickup start + the shelf-life of
// the food category and storage, or + 6 h when unknown, never after the branch's closing time) and shown here as an
// Estimate before saving (NFR-05a). Saving compresses and uploads the photo (NFR-08a, C-26); if the upload fails the
// form keeps every value and offers Retry (E-LST-02). Invalid fields are marked (E-LST-04, IF-UI-06). The listing is
// saved as a Draft and published on the next screen.
// US-12 (FR-LST-03, D-80 to D-84): after choosing the photo the vendor may tap "Fill in with AI draft" (D-84); the photo
// is then uploaded and the AI draft fills the name and
// description in both languages and the category; each AI-filled field is marked Draft and must be confirmed or edited
// before saving (NFR-05b); the estimated quantity is only shown as an Estimate. Without a draft (E-LST-01) the vendor
// fills the form by hand.
import { useEffect, useRef, useState } from 'react';
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
import {
  createListing,
  getShop,
  previewPickBy,
  type AiDraft,
  type AiField,
  type Branch,
  type ListingRequest,
  type PickByPreview,
} from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AiMark } from '@/components/AiMark';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { CounterField } from '@/components/CounterField';
import { DateTimeField } from '@/components/DateTimeField';
import { Notice } from '@/components/Notice';
import { OptionList } from '@/components/OptionList';
import { PhotoPicker } from '@/components/PhotoPicker';
import { Screen } from '@/components/Screen';
import { SelectField } from '@/components/SelectField';
import { TextField } from '@/components/TextField';
import { useLanguage } from '@/i18n/LanguageProvider';
import { useCategoryHours } from '@/listings/categoryHours';
import { formatDateTime } from '@/listings/formatDateTime';
import { categoryWithHours } from '@/listings/perishabilityText';
import { textLanguageOf } from '@/listings/listingText';
import {
  parseAmount,
  pickupNoteFor,
  preparePhoto,
  type PhotoUpload,
  type PickupNote,
} from '@/listings/formHelpers';
import { spacing } from '@/theme';

type Problem =
  | 'uploadFailed'
  | 'tooLarge'
  | 'notApproved'
  | 'unreachable'
  | 'unexpected'
  | 'hoursRequired'
  | 'informalVendor';

const CATEGORIES: readonly ListingFoodCategory[] = [...FOOD_CATEGORIES, UNKNOWN];

/** The preview answer, kept with the inputs it was asked for so an old answer is never shown for new inputs. */
interface Preview {
  key: string;
  result: PickByPreview | null;
}

export default function NewListingScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();
  const hours = useCategoryHours();

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  // Kept after a successful upload, so Retry and a second save do not upload again.
  const [photoKey, setPhotoKey] = useState<string | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [bags, setBags] = useState(1);
  const [originalValue, setOriginalValue] = useState('');
  const [price, setPrice] = useState('');
  const [pickupStart, setPickupStart] = useState<string | null>(null);
  // D-69: an earlier end the vendor chose; null = the worked-out latest end.
  const [pickupEnd, setPickupEnd] = useState<string | null>(null);
  const [foodCategory, setFoodCategory] = useState<ListingFoodCategory | null>(null);
  const [storage, setStorage] = useState<StorageCondition | null>(null);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState<string | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  // US-12: the upload started when the photo was chosen, the AI draft and which AI fields are confirmed.
  const upload = useRef<{ uri: string; result: Promise<PhotoUpload> } | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [noDraft, setNoDraft] = useState(false);
  const [secondName, setSecondName] = useState('');
  const [secondDescription, setSecondDescription] = useState('');
  const [aiFields, setAiFields] = useState<AiField[]>([]);
  const [confirmed, setConfirmed] = useState<AiField[]>([]);
  const [showUnconfirmed, setShowUnconfirmed] = useState(false);

  const [invalid, setInvalid] = useState<ListingField[]>([]);
  // D-62: a message from the server for the pickup start (the branch is closed then).
  const [pickupNote, setPickupNote] = useState<PickupNote | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (token === null) return;
    let active = true;
    void getShop(token)
      .then((result) => {
        if (active && result.kind === 'ok') {
          setBranches(result.shop.branches);
          // With one branch there is nothing to choose.
          const only = result.shop.branches.length === 1 ? result.shop.branches[0] : undefined;
          if (only !== undefined) setBranchId((current) => current ?? only.id);
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token]);

  // D-64: the pick-by time for the chosen food, start and branch, as the server will save it.
  const previewKey =
    foodCategory !== null && storage !== null && pickupStart !== null && branchId !== null
      ? [foodCategory, storage, pickupStart, branchId].join('|')
      : null;
  useEffect(() => {
    if (token === null || previewKey === null || foodCategory === null || storage === null) return;
    if (pickupStart === null || branchId === null) return;
    let active = true;
    void previewPickBy(token, {
      foodCategory,
      storage,
      pickupStart,
      branchId,
      ...(photoKey === null ? {} : { photoKey }),
    })
      .then((result) => {
        if (!active) return;
        setPreview({ key: previewKey, result: result.kind === 'ok' ? result.preview : null });
        if (result.kind === 'invalid' && result.hours !== undefined) {
          setPickupNote({ field: 'pickupStart', message: t('listing.errors.outsideHours', result.hours) });
        }
      })
      .catch(() => undefined);
    return () => {
      active = false;
    };
  }, [token, previewKey, foodCategory, storage, pickupStart, branchId, photoKey, t]);

  // D-81: the main text fields are in the app language and the second ones in the other. When the vendor switches the
  // language after a draft, each text and its Confirmed state move to the field of their own language.
  const [shownLanguage, setShownLanguage] = useState(language);
  if (shownLanguage !== language) {
    // Adjusting state while rendering when the language changes (React: "storing information from previous renders").
    setShownLanguage(language);
    if (draft !== null) {
      setName(secondName);
      setSecondName(name);
      setDescription(secondDescription);
      setSecondDescription(description);
      const swap: Partial<Record<AiField, AiField>> = {
        name: 'secondName',
        secondName: 'name',
        description: 'secondDescription',
        secondDescription: 'description',
      };
      setConfirmed((current) => current.map((field) => swap[field] ?? field));
      const texts: string[] = ['name', 'description', 'secondName', 'secondDescription'];
      setInvalid((current) => current.filter((f) => !texts.includes(f)));
    }
  }

  if (token === null) return <Redirect href="/" />;
  const session = token;
  const shownPreview = preview !== null && preview.key === previewKey ? preview.result : null;

  function clear(...fields: ListingField[]) {
    setInvalid((current) => current.filter((f) => !fields.includes(f)));
    setProblem(null);
  }

  const err = (field: ListingField, key: string) => (invalid.includes(field) ? t(key) : undefined);

  const unconfirmed = aiFields.filter((field) => !confirmed.includes(field));
  const confirm = (field: AiField) =>
    setConfirmed((current) => (current.includes(field) ? current : [...current, field]));
  /** NFR-05b: the message on an AI field the vendor has not confirmed yet, once they tried to save. */
  const aiErr = (field: AiField) =>
    showUnconfirmed && unconfirmed.includes(field) ? t('aiDraft.confirmNeeded') : undefined;
  const aiMark = (field: AiField) =>
    aiFields.includes(field) ? (
      <AiMark testID={`ai-${field}`} confirmed={confirmed.includes(field)} onConfirm={() => confirm(field)} />
    ) : null;

  /** FR-LST-03: fills the form from the draft, the main fields in the app language and the others in the other. */
  function applyDraft(next: AiDraft) {
    const ar = language === 'ar';
    setName(ar ? next.nameAr : next.nameEn);
    setDescription(ar ? next.descriptionAr : next.descriptionEn);
    setSecondName(ar ? next.nameEn : next.nameAr);
    setSecondDescription(ar ? next.descriptionEn : next.descriptionAr);
    const known = next.foodCategory !== UNKNOWN;
    if (known) setFoodCategory(next.foodCategory);
    const filled: AiField[] = ['name', 'description', 'secondName', 'secondDescription'];
    setAiFields(known ? [...filled, 'foodCategory'] : filled);
    setConfirmed([]);
    setDraft(next);
  }

  /** A new photo: the draft of the old one no longer applies. */
  function resetDraft() {
    upload.current = null;
    setDraft(null);
    setNoDraft(false);
    setAiFields([]);
    setConfirmed([]);
    setSecondName('');
    setSecondDescription('');
    setShowUnconfirmed(false);
  }

  /** D-84: uploads the chosen photo when the vendor asks for the AI draft (US-12). */
  function startUpload(uri: string) {
    resetDraft();
    setDrafting(true);
    const result = preparePhoto(session, uri);
    upload.current = { uri, result };
    void result
      .then((answer) => {
        if (upload.current?.uri !== uri) return;
        setDrafting(false);
        if (answer.kind !== 'ok') return; // Save uploads again and shows the problem (E-LST-02).
        setPhotoKey(answer.photoKey);
        if (answer.draft != null) applyDraft(answer.draft);
        else if (answer.draftError === 'E-LST-01') setNoDraft(true);
      })
      .catch(() => setDrafting(false));
  }

  function body(key: string): ListingRequest {
    const ai =
      draft === null
        ? {}
        : {
            ...(secondName.trim() === '' ? {} : { secondName }),
            ...(secondDescription.trim() === '' ? {} : { secondDescription }),
            confirmedAiFields: confirmed,
          };
    return {
      ...ai,
      photoKey: key,
      name,
      description,
      // D-66: stored as written; the language is read from the text itself.
      language: textLanguageOf(`${name} ${description}`),
      foodCategory: foodCategory ?? undefined,
      storage: storage ?? undefined,
      bagsTotal: bags,
      originalValue: parseAmount(originalValue),
      price: parseAmount(price),
      pickupStart: pickupStart ?? undefined,
      pickupEnd: pickupEnd ?? undefined,
      branchId: branchId ?? undefined,
    };
  }

  async function save() {
    setProblem(null);
    setPickupNote(null);
    // Checked before the upload, so nothing is sent while a field is wrong. A placeholder stands for the photo key
    // and, until the branches have loaded, for the branch.
    const check = validateListing(body(photoUri === null ? '' : (photoKey ?? 'photo')));
    if (!check.ok) {
      setInvalid(check.fields);
      setShowUnconfirmed(unconfirmed.length > 0);
      return;
    }
    // NFR-05b: every AI-filled field confirmed or edited first (the server checks it again).
    if (unconfirmed.length > 0) {
      setShowUnconfirmed(true);
      return;
    }
    // D-69: not later than the worked-out limit (the server checks it again, E-LST-03).
    if (pickupEnd !== null && shownPreview !== null && pickupEnd > shownPreview.pickupEnd) {
      setPickupNote(
        pickupNoteFor({ kind: 'afterExpiry', latestPickupEnd: shownPreview.pickupEnd }, t, language),
      );
      return;
    }
    setInvalid([]);
    setSaving(true);
    let key = photoKey;
    // The upload started when the photo was chosen; wait for it rather than sending the photo twice.
    const started = upload.current;
    if (key === null && photoUri !== null && started?.uri === photoUri) {
      const answer = await started.result.catch(() => null);
      if (answer?.kind === 'ok') key = answer.photoKey;
    }
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
        if (result.unconfirmedAi === true) {
          // NFR-05b: the server found AI fields that are not confirmed.
          setConfirmed((current) => current.filter((f) => !result.fields.includes(f)));
          setShowUnconfirmed(true);
          break;
        }
        setInvalid(result.fields as ListingField[]);
        setPickupNote(pickupNoteFor(result, t, language));
        break;
      case 'afterExpiry':
        // D-69: the chosen end is later than the worked-out limit.
        setPickupNote(pickupNoteFor(result, t, language));
        break;
      case 'hoursRequired':
      case 'notApproved':
      case 'unreachable':
      case 'informalVendor':
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

        {invalid.length > 0 || pickupNote !== null ? (
          <Notice testID="listing-errors" tone="error" title={t('errors.fixFields')} />
        ) : null}

        <PhotoPicker
          uri={photoUri}
          onPick={(uri) => {
            setPhotoUri(uri);
            setPhotoKey(null);
            clear('photoKey');
            resetDraft();
          }}
          error={err('photoKey', 'listing.errors.photo')}
        />

        {/* D-84: the AI draft is asked for only when the vendor taps this; otherwise the photo is sent on Save. */}
        {photoUri !== null && draft === null && !drafting ? (
          <Button
            testID="ai-fill"
            variant="secondary"
            label={t('aiDraft.fill')}
            onPress={() => startUpload(photoUri)}
          />
        ) : null}

        {drafting ? (
          <AppText testID="ai-working" color="textMuted">
            {t('aiDraft.working')}
          </AppText>
        ) : null}
        {draft !== null ? (
          <Notice testID="ai-notice" tone="info" message={t('aiDraft.notice')}>
            {draft.quantity !== null ? (
              <AppText testID="ai-quantity">
                {t('aiDraft.quantityEstimate', { count: draft.quantity })}
              </AppText>
            ) : null}
          </Notice>
        ) : null}
        {noDraft ? <Notice testID="ai-unavailable" tone="info" message={t('aiDraft.unavailable')} /> : null}

        <TextField
          testID="listing-name"
          label={t('listing.nameLabel')}
          placeholder={t('listing.namePlaceholder')}
          value={name}
          onChangeText={(text) => {
            setName(text);
            clear('name');
            confirm('name');
          }}
          error={err('name', 'listing.errors.name') ?? aiErr('name')}
          below={aiMark('name')}
        />
        <TextField
          testID="listing-description"
          label={t('listing.descriptionLabel')}
          value={description}
          onChangeText={(text) => {
            setDescription(text);
            clear('description');
            confirm('description');
          }}
          error={err('description', 'listing.errors.description') ?? aiErr('description')}
          below={aiMark('description')}
          multiline
        />

        {/* D-81: the draft text in the other language, stored too when the vendor keeps it. */}
        {draft !== null ? (
          <>
            <TextField
              testID="listing-second-name"
              label={t('aiDraft.secondNameLabel')}
              value={secondName}
              onChangeText={(text) => {
                setSecondName(text);
                clear('secondName');
                confirm('secondName');
              }}
              error={err('secondName', 'listing.errors.name') ?? aiErr('secondName')}
              below={aiMark('secondName')}
            />
            <TextField
              testID="listing-second-description"
              label={t('aiDraft.secondDescriptionLabel')}
              value={secondDescription}
              onChangeText={(text) => {
                setSecondDescription(text);
                clear('secondDescription');
                confirm('secondDescription');
              }}
              error={err('secondDescription', 'listing.errors.description') ?? aiErr('secondDescription')}
              below={aiMark('secondDescription')}
              multiline
            />
          </>
        ) : null}

        <CounterField
          testID="listing-bags"
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
            setPickupNote(null);
            clear('pickupStart');
          }}
          error={
            pickupNote?.field === 'pickupStart'
              ? pickupNote.message
              : err('pickupStart', 'listing.errors.pickupStart')
          }
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
            confirm('foodCategory');
          }}
          error={err('foodCategory', 'listing.errors.foodCategory') ?? aiErr('foodCategory')}
        />
        {aiMark('foodCategory')}

        <SelectField<StorageCondition>
          testID="listing-storage"
          label={t('listing.storageLabel')}
          placeholder={t('listing.storagePlaceholder')}
          options={STORAGE_CONDITIONS.map((value) => ({ value, label: t(`listing.storage.${value}`) }))}
          value={storage}
          onChange={(value) => {
            setStorage(value);
            clear('storage');
          }}
          error={err('storage', 'listing.errors.storage')}
        />

        <OptionList<string>
          testID="listing-branches"
          label={t('listing.branchLabel')}
          options={branches.map((branch) => ({
            value: branch.id,
            // D-69: branches carry the store name, so they are told apart by address.
            label: branch.address,
            description:
              branch.opensAt !== null && branch.closesAt !== null
                ? t('listing.shopHours', { opensAt: branch.opensAt, closesAt: branch.closesAt })
                : undefined,
          }))}
          selected={branchId === null ? [] : [branchId]}
          onToggle={(value) => {
            setBranchId(value);
            setPickupNote(null);
            clear('branchId', 'pickupStart');
          }}
          error={err('branchId', 'listing.errors.branch')}
        />

        {/* D-74: the window the vendor may use, with the category (and its hours) as the reason. */}
        <View testID="listing-pick-by" style={styles.group}>
          <AppText variant="label">{t('listing.pickWindowLabel')}</AppText>
          <AppText color={shownPreview === null ? 'textMuted' : 'text'}>
            {shownPreview === null || pickupStart === null
              ? t('listing.pickByPending')
              : t('listing.pickWindowValue', {
                  start: formatDateTime(pickupStart, language),
                  end: formatDateTime(shownPreview.pickupEnd, language),
                })}
          </AppText>
          {shownPreview !== null ? (
            <AppText testID="listing-pick-by-reason" variant="caption" color="textMuted">
              {t('listing.pickByReason', { category: categoryWithHours(t, shownPreview.category, hours) })}
            </AppText>
          ) : (
            <AppText variant="caption" color="textMuted">
              {t('listing.pickByHint')}
            </AppText>
          )}
          {shownPreview?.cappedAtClosing === true ? (
            <AppText variant="caption" color="textMuted">
              {t('listing.pickByCapped')}
            </AppText>
          ) : null}
        </View>

        <DateTimeField
          testID="listing-pickup-end"
          label={t('listing.pickupEndLabel')}
          hint={t('listing.pickupEndHint')}
          value={pickupEnd ?? shownPreview?.pickupEnd ?? null}
          onChange={(iso) => {
            setPickupEnd(iso);
            setPickupNote(null);
            clear('pickupEnd');
          }}
          error={
            pickupNote?.field === 'pickupEnd'
              ? pickupNote.message
              : err('pickupEnd', 'listing.errors.pickupEnd')
          }
        />

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
