// Quick Post (US-11, FR-LST-02) for informal vendors: a photo, the name and description in Arabic or English (D-66,
// stored as written), the number of bags (a +/- counter, D-64), the price and the pickup start and end. The start is
// optional: without it the pickup starts when it is posted (D-43, D-75). The pickup is at the shop pin, and the listing
// is published at once and treated as Highly perishable. A failed photo upload keeps the values and offers Retry (E-LST-02).
// D-86 (SRS 4.2, Quick Post step 1; US-12 as on the full listing, D-81 to D-84): after choosing the photo the vendor may
// tap "Fill in with AI draft"; the draft fills the name and description in both languages and the category; each
// AI-filled field is marked Draft and must be confirmed or edited before posting (NFR-05b); the estimated quantity is
// only shown as an Estimate. Without a draft (E-LST-01) the vendor fills the form by hand.
import { useRef, useState } from 'react';
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
import { createQuickPost, type AiDraft, type AiField, type QuickPostRequest } from '@/api/client';
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
import { TextField } from '@/components/TextField';
import { useLanguage } from '@/i18n/LanguageProvider';
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
  // D-86: the upload started for the AI draft, the draft, and which AI fields are confirmed.
  const upload = useRef<{ uri: string; result: Promise<PhotoUpload> } | null>(null);
  const [drafting, setDrafting] = useState(false);
  const [draft, setDraft] = useState<AiDraft | null>(null);
  const [noDraft, setNoDraft] = useState(false);
  const [secondName, setSecondName] = useState('');
  const [secondDescription, setSecondDescription] = useState('');
  const [aiFields, setAiFields] = useState<AiField[]>([]);
  const [confirmed, setConfirmed] = useState<AiField[]>([]);
  const [showUnconfirmed, setShowUnconfirmed] = useState(false);

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

  function clear(field: QuickPostField) {
    setInvalid((current) => current.filter((f) => f !== field));
    setProblem(null);
  }

  const err = (field: QuickPostField, key: string) => (invalid.includes(field) ? t(key) : undefined);

  const unconfirmed = aiFields.filter((field) => !confirmed.includes(field));
  const confirm = (field: AiField) =>
    setConfirmed((current) => (current.includes(field) ? current : [...current, field]));
  /** NFR-05b: the message on an AI field the vendor has not confirmed yet, once they tried to post. */
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

  /** D-84, D-86: uploads the chosen photo and asks for the AI draft when the vendor taps the button. */
  function startUpload(uri: string) {
    resetDraft();
    setDrafting(true);
    const result = preparePhoto(session, uri, { draft: true });
    upload.current = { uri, result };
    void result
      .then((answer) => {
        if (upload.current?.uri !== uri) return;
        setDrafting(false);
        if (answer.kind !== 'ok') return; // Posting uploads again and shows the problem (E-LST-02).
        setPhotoKey(answer.photoKey);
        if (answer.draft != null) applyDraft(answer.draft);
        else if (answer.draftError === 'E-LST-01') setNoDraft(true);
      })
      .catch(() => setDrafting(false));
  }

  function body(key: string): QuickPostRequest {
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
      setShowUnconfirmed(unconfirmed.length > 0);
      return;
    }
    // NFR-05b: every AI-filled field confirmed or edited first (the server checks it again).
    if (unconfirmed.length > 0) {
      setShowUnconfirmed(true);
      return;
    }
    setInvalid([]);
    setPosting(true);
    let key = photoKey;
    // The upload for the AI draft may still be running; wait for it rather than sending the photo twice.
    const started = upload.current;
    if (key === null && photoUri !== null && started?.uri === photoUri) {
      const answer = await started.result.catch(() => null);
      if (answer?.kind === 'ok') key = answer.photoKey;
    }
    if (key === null && photoUri !== null) {
      const uploaded = await preparePhoto(session, photoUri);
      if (uploaded.kind !== 'ok') {
        setPosting(false);
        if (uploaded.kind === 'unauthorized' || uploaded.kind === 'suspended') {
          await signOut();
          return;
        }
        setProblem(uploaded.kind === 'failed' ? 'uploadFailed' : uploaded.kind);
        return;
      }
      key = uploaded.photoKey;
      setPhotoKey(key);
    }
    const result = await createQuickPost(session, body(key ?? ''));
    setPosting(false);
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
            resetDraft();
          }}
          error={err('photoKey', 'listing.errors.photo')}
        />

        {/* D-84, D-86: the AI draft is asked for only when the vendor taps this; otherwise the photo is sent on Post. */}
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
          testID="quick-name"
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
          testID="quick-description"
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

        {/* D-81, D-86: the draft text in the other language, stored too when the vendor keeps it. */}
        {draft !== null ? (
          <>
            <TextField
              testID="quick-second-name"
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
              testID="quick-second-description"
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
            confirm('foodCategory');
          }}
          error={err('foodCategory', 'listing.errors.foodCategory') ?? aiErr('foodCategory')}
        />
        {aiMark('foodCategory')}
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
