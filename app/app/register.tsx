// Register screen. The role comes from the Welcome screen as ?role=consumer, vendor or partner (decision D-30;
// anything else opens the consumer form), so this screen shows only that role's form:
// - consumer (US-01): email address or mobile number and a password (FR-ACC-01);
// - vendor (US-02): shop name, formal or informal, contact, map pin and written address (FR-ACC-02);
// - partner (US-03): Charity, Composting or Other, organisation name, map pin and address, accepted food types
//   (FR-ACC-03). D-31: Other partner and the Other food type each ask the partner to write what it is.
// Vendors and partners also choose their login details with the US-01 rules. Invalid fields are marked (E-ACC-02,
// IF-UI-06); an already registered email or phone offers Log in and Reset password (E-ACC-01). The same shared
// validators run here and on the server.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import {
  ACCEPTED_FOOD_TYPES,
  OTHER_FOOD_TYPE,
  PARTNER_ROLES,
  TEXT_LIMITS,
  type AcceptedFoodType,
  validateRegistration,
  validateSignUp,
  type PartnerRole,
  type SignUpField,
  type VendorType,
} from '@nowaste/shared';
import { registerConsumer, submitApplication, type ApplicationRequest } from '@/api/client';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { LocationPicker } from '@/components/LocationPicker';
import type { Coordinates } from '@/components/MapView';
import { Notice } from '@/components/Notice';
import { OptionList } from '@/components/OptionList';
import { PasswordRules } from '@/components/PasswordRules';
import { Screen } from '@/components/Screen';
import { SegmentedControl } from '@/components/SegmentedControl';
import { TextField } from '@/components/TextField';
import { useLanguage } from '@/i18n/LanguageProvider';
import { spacing } from '@/theme';

type Method = 'email' | 'phone';
type Problem = 'unreachable' | 'unexpected';

export default function RegisterScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { language } = useLanguage();

  const { role } = useLocalSearchParams<{ role?: string }>();
  const form = role === 'vendor' ? 'vendor' : role === 'partner' ? 'partner' : 'consumer';
  // A partner says which kind on this screen; nothing is chosen at the start.
  const [partnerType, setPartnerType] = useState<PartnerRole | null>(null);
  const [method, setMethod] = useState<Method>('email');
  const [identifier, setIdentifier] = useState('');
  const [password, setPassword] = useState('');
  const [invalid, setInvalid] = useState<SignUpField[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [duplicate, setDuplicate] = useState<Method | null>(null);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [showResetNote, setShowResetNote] = useState(false);
  const [showLoginNote, setShowLoginNote] = useState(false);
  // Vendor (US-02) and partner (US-03) details.
  const [shopName, setShopName] = useState('');
  const [vendorType, setVendorType] = useState<VendorType>('formal');
  const [contact, setContact] = useState('');
  const [description, setDescription] = useState('');
  const [organisationName, setOrganisationName] = useState('');
  const [otherPartnerType, setOtherPartnerType] = useState('');
  const [foodTypes, setFoodTypes] = useState<AcceptedFoodType[]>([]);
  const [otherFoodType, setOtherFoodType] = useState('');
  const [pin, setPin] = useState<Coordinates | null>(null);
  const [address, setAddress] = useState('');

  const isConsumer = form === 'consumer';
  const isPartner = form === 'partner';
  const acceptsOtherFood = foodTypes.includes(OTHER_FOOD_TYPE);

  function clearField(...cleared: SignUpField[]) {
    setInvalid((fields) => fields.filter((f) => !cleared.includes(f)));
  }

  function errorFor(field: SignUpField, messageKey: string): string | undefined {
    return invalid.includes(field) ? t(messageKey) : undefined;
  }

  /** An empty field asks for the value; a filled one that is still invalid gets the second message. */
  function textError(
    field: SignUpField,
    value: string,
    emptyKey: string,
    filledKey: string,
    max?: number,
  ): string | undefined {
    if (!invalid.includes(field)) return undefined;
    return value.trim() === '' ? t(emptyKey) : t(filledKey, { max });
  }

  function identifierError(): string | undefined {
    if (!invalid.includes(method)) return undefined;
    const blank = identifier.trim() === '';
    if (method === 'email') return blank ? t('errors.emailRequired') : t('errors.emailInvalid');
    return blank ? t('errors.phoneRequired') : t('errors.phoneInvalid');
  }

  function showResult(
    result: Awaited<ReturnType<typeof submitApplication>> | Awaited<ReturnType<typeof registerConsumer>>,
    successPath: '/registered' | '/applied',
  ) {
    switch (result.kind) {
      case 'created':
        router.replace(successPath);
        break;
      case 'invalid':
        setInvalid(result.fields);
        break;
      case 'duplicate':
        setDuplicate(result.field);
        break;
      default:
        setProblem(result.kind);
    }
  }

  function applicationBody(): ApplicationRequest {
    const login = {
      ...(method === 'email' ? { email: identifier } : { phone: identifier }),
      password,
      language,
    };
    // Without a pin the coordinates are left out, so the validator marks the location.
    const where = { address, latitude: pin?.latitude as number, longitude: pin?.longitude as number };
    if (form === 'vendor') {
      return {
        ...login,
        role: 'vendor',
        vendorProfile: { shopName, vendorType, contact, description, ...where },
      };
    }
    return {
      ...login,
      // Until a kind is chosen the other fields are still checked as for a charity; submit() adds `role`.
      role: partnerType ?? 'charity',
      partnerProfile: {
        organisationName,
        ...where,
        // Sent in the order of SRS Appendix A, with Other last.
        acceptedFoodTypes: ACCEPTED_FOOD_TYPES.filter((type) => foodTypes.includes(type)),
        // The written texts are sent only when Other is chosen.
        ...(partnerType === 'other' ? { otherPartnerType } : {}),
        ...(acceptsOtherFood ? { otherFoodType } : {}),
      },
    };
  }

  async function submit() {
    setDuplicate(null);
    setProblem(null);
    setShowResetNote(false);
    setShowLoginNote(false);

    if (!isConsumer) {
      const application = applicationBody();
      const check = validateSignUp(application);
      const missingType = isPartner && partnerType === null;
      if (!check.ok || missingType) {
        setInvalid([...(missingType ? (['role'] as const) : []), ...(check.ok ? [] : check.fields)]);
        return;
      }
      setInvalid([]);
      setSubmitting(true);
      const result = await submitApplication(application);
      setSubmitting(false);
      showResult(result, '/applied');
      return;
    }

    const body = {
      ...(method === 'email' ? { email: identifier } : { phone: identifier }),
      password,
      language,
    };
    const check = validateRegistration(body);
    if (!check.ok) {
      setInvalid(check.fields);
      return;
    }
    setInvalid([]);
    setSubmitting(true);
    const result = await registerConsumer(body);
    setSubmitting(false);
    showResult(result, '/registered');
  }

  return (
    <Screen scroll>
      <AppText color="textMuted">
        {isConsumer
          ? t('register.intro')
          : isPartner
            ? t('register.introPartner')
            : t('register.introVendor')}
      </AppText>

      {invalid.length > 0 ? (
        <Notice
          testID="register-errors"
          tone="error"
          title={t('errors.fixFields')}
          message={invalid.includes('language') ? t('errors.languageInvalid') : undefined}
        />
      ) : null}

      {duplicate !== null ? (
        <Notice
          testID="register-duplicate"
          tone="error"
          title={duplicate === 'email' ? t('duplicate.emailTitle') : t('duplicate.phoneTitle')}
          message={t('duplicate.message')}
        >
          <View style={styles.duplicateActions}>
            {/* Log in is US-04 (turn 3); password reset is US-05, whose SRS 6.2 fallback is a reset by the team. */}
            <Button
              variant="secondary"
              label={t('duplicate.login')}
              accessibilityHint={t('welcome.loginHint')}
              onPress={() => {
                setShowLoginNote(true);
              }}
            />
            <Button
              variant="link"
              label={t('duplicate.resetPassword')}
              onPress={() => {
                setShowResetNote(true);
              }}
            />
          </View>
          {showLoginNote ? <AppText variant="caption">{t('welcome.loginComingSoon')}</AppText> : null}
          {showResetNote ? <AppText variant="caption">{t('duplicate.resetContact')}</AppText> : null}
        </Notice>
      ) : null}

      {problem !== null ? (
        <Notice
          testID="register-problem"
          tone="error"
          message={problem === 'unreachable' ? t('errors.unreachable') : t('errors.unexpected')}
        />
      ) : null}

      {form === 'vendor' ? (
        <>
          <TextField
            testID="register-shop-name"
            label={t('vendor.shopNameLabel')}
            placeholder={t('vendor.shopNamePlaceholder')}
            value={shopName}
            onChangeText={(text) => {
              setShopName(text);
              clearField('shopName');
            }}
            error={textError(
              'shopName',
              shopName,
              'errors.shopNameRequired',
              'errors.shopNameTooLong',
              TEXT_LIMITS.name,
            )}
          />
          <View style={styles.group}>
            <AppText variant="label">{t('vendor.typeLabel')}</AppText>
            <SegmentedControl<VendorType>
              options={[
                { value: 'formal', label: t('vendor.typeFormal') },
                { value: 'informal', label: t('vendor.typeInformal') },
              ]}
              value={vendorType}
              onChange={(next) => {
                setVendorType(next);
                clearField('vendorType');
              }}
              accessibilityLabel={t('vendor.typeLabel')}
              accessibilityHint={t('vendor.typeHint')}
            />
            <AppText variant="caption" color={invalid.includes('vendorType') ? 'error' : 'textMuted'}>
              {invalid.includes('vendorType') ? t('errors.vendorTypeInvalid') : t('vendor.typeHint')}
            </AppText>
          </View>
          <TextField
            testID="register-contact"
            label={t('vendor.contactLabel')}
            placeholder={t('vendor.contactPlaceholder')}
            hint={t('vendor.contactHint')}
            value={contact}
            onChangeText={(text) => {
              setContact(text);
              clearField('contact');
            }}
            error={textError('contact', contact, 'errors.contactRequired', 'errors.contactInvalid')}
            keyboardType="phone-pad"
            autoComplete="tel"
            maxLength={11}
          />
          <TextField
            testID="register-description"
            label={t('vendor.descriptionLabel')}
            placeholder={t('vendor.descriptionPlaceholder')}
            value={description}
            onChangeText={(text) => {
              setDescription(text);
              clearField('description');
            }}
            error={
              invalid.includes('description')
                ? t('errors.descriptionTooLong', { max: TEXT_LIMITS.description })
                : undefined
            }
            multiline
            below={
              <AppText
                variant="caption"
                color={[...description.trim()].length > TEXT_LIMITS.description ? 'error' : 'textMuted'}
              >
                {t('vendor.descriptionCount', {
                  count: [...description.trim()].length,
                  max: TEXT_LIMITS.description,
                })}
              </AppText>
            }
          />
        </>
      ) : null}

      {isPartner ? (
        <OptionList<PartnerRole>
          testID="partner-types"
          label={t('partner.typeLabel')}
          options={PARTNER_ROLES.map((type) => ({
            value: type,
            label: t(`accountTypes.${type}`),
            description: t(`accountTypes.${type}Description`),
          }))}
          selected={partnerType === null ? [] : [partnerType]}
          onToggle={(type) => {
            setPartnerType(type);
            clearField('role');
          }}
          error={errorFor('role', 'errors.partnerTypeRequired')}
        />
      ) : null}

      {isPartner && partnerType === 'other' ? (
        <TextField
          testID="register-other-partner-type"
          label={t('partner.otherTypeLabel')}
          placeholder={t('partner.otherTypePlaceholder')}
          value={otherPartnerType}
          onChangeText={(text) => {
            setOtherPartnerType(text);
            clearField('otherPartnerType');
          }}
          error={textError(
            'otherPartnerType',
            otherPartnerType,
            'errors.otherPartnerTypeRequired',
            'errors.otherPartnerTypeTooLong',
            TEXT_LIMITS.name,
          )}
        />
      ) : null}

      {isPartner ? (
        <TextField
          testID="register-organisation"
          label={t('partner.organisationLabel')}
          placeholder={t('partner.organisationPlaceholder')}
          value={organisationName}
          onChangeText={(text) => {
            setOrganisationName(text);
            clearField('organisationName');
          }}
          error={textError(
            'organisationName',
            organisationName,
            'errors.organisationRequired',
            'errors.organisationTooLong',
            TEXT_LIMITS.name,
          )}
        />
      ) : null}

      {!isConsumer ? (
        <LocationPicker
          pin={pin}
          onPinChange={(next) => {
            setPin(next);
            clearField('latitude', 'longitude');
          }}
          address={address}
          onAddressChange={(text) => {
            setAddress(text);
            clearField('address');
          }}
          pinError={
            invalid.includes('latitude') || invalid.includes('longitude')
              ? t('errors.pinRequired')
              : undefined
          }
          addressError={textError(
            'address',
            address,
            'errors.addressRequired',
            'errors.addressTooLong',
            TEXT_LIMITS.address,
          )}
        />
      ) : null}

      {isPartner ? (
        <OptionList<AcceptedFoodType>
          testID="food-types"
          multiple
          label={t('partner.foodTypesLabel')}
          options={ACCEPTED_FOOD_TYPES.map((type) => ({
            value: type,
            label: t(`foodCategories.${type}`),
          }))}
          selected={foodTypes}
          onToggle={(type) => {
            setFoodTypes((chosen) =>
              chosen.includes(type) ? chosen.filter((c) => c !== type) : [...chosen, type],
            );
            clearField('acceptedFoodTypes', 'otherFoodType');
          }}
          error={errorFor('acceptedFoodTypes', 'errors.foodTypesRequired')}
        />
      ) : null}

      {isPartner && acceptsOtherFood ? (
        <TextField
          testID="register-other-food-type"
          label={t('partner.otherFoodTypeLabel')}
          placeholder={t('partner.otherFoodTypePlaceholder')}
          value={otherFoodType}
          onChangeText={(text) => {
            setOtherFoodType(text);
            clearField('otherFoodType');
          }}
          error={textError(
            'otherFoodType',
            otherFoodType,
            'errors.otherFoodTypeRequired',
            'errors.otherFoodTypeTooLong',
            TEXT_LIMITS.name,
          )}
        />
      ) : null}

      {!isConsumer ? (
        <AppText variant="heading" accessibilityRole="header">
          {t('register.accountSection')}
        </AppText>
      ) : null}

      <View style={styles.group}>
        <AppText variant="label">{t('register.methodLabel')}</AppText>
        <SegmentedControl<Method>
          options={[
            { value: 'email', label: t('register.methodEmail') },
            { value: 'phone', label: t('register.methodPhone') },
          ]}
          value={method}
          onChange={(next) => {
            setMethod(next);
            setIdentifier('');
            setDuplicate(null);
            setInvalid((fields) => fields.filter((f) => f !== 'email' && f !== 'phone'));
          }}
          accessibilityLabel={t('register.methodLabel')}
        />
      </View>

      {method === 'email' ? (
        <TextField
          key="email"
          testID="register-email"
          label={t('register.emailLabel')}
          placeholder={t('register.emailPlaceholder')}
          value={identifier}
          onChangeText={(text) => {
            setIdentifier(text);
            clearField('email');
          }}
          error={identifierError()}
          keyboardType="email-address"
          autoCapitalize="none"
          autoCorrect={false}
          autoComplete="email"
          textContentType="emailAddress"
          returnKeyType="next"
        />
      ) : (
        <TextField
          key="phone"
          testID="register-phone"
          label={t('register.phoneLabel')}
          placeholder={t('register.phonePlaceholder')}
          hint={t('register.phoneHint')}
          value={identifier}
          onChangeText={(text) => {
            setIdentifier(text);
            clearField('phone');
          }}
          error={identifierError()}
          keyboardType="phone-pad"
          autoComplete="tel"
          textContentType="telephoneNumber"
          maxLength={11}
          returnKeyType="next"
        />
      )}

      <TextField
        testID="register-password"
        label={t('register.passwordLabel')}
        value={password}
        onChangeText={(text) => {
          setPassword(text);
          clearField('password');
        }}
        error={invalid.includes('password') ? t('errors.passwordInvalid') : undefined}
        password
        autoCapitalize="none"
        autoCorrect={false}
        autoComplete="new-password"
        textContentType="newPassword"
        returnKeyType="done"
        onSubmitEditing={() => {
          void submit();
        }}
        below={<PasswordRules password={password} showErrors={invalid.includes('password')} />}
      />

      <View style={styles.submit}>
        <Button
          testID="register-submit"
          label={isConsumer ? t('register.submit') : t('register.submitApplication')}
          busyLabel={isConsumer ? t('register.submitting') : t('register.submittingApplication')}
          busy={submitting}
          onPress={() => {
            void submit();
          }}
        />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  group: {
    gap: spacing.sm,
  },
  duplicateActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: spacing.md,
  },
  submit: {
    marginTop: spacing.sm,
  },
});
