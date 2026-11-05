// One extra branch of a vendor (decision D-64): its written address and map pin, and its own opening hours
// (D-62). It carries the store name (D-69), so it has no name field. Used on the vendor sign-up form and on the Branches and opening hours screen. Invalid fields are marked
// (E-ACC-02, IF-UI-06).
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { BranchField } from '@nowaste/shared';
import { AppText } from './AppText';
import { LocationPicker } from './LocationPicker';
import type { Coordinates } from './MapView';
import { TimeField } from './TimeField';
import { hoursErrorKey } from '@/listings/clockTime';
import { colors, radius, spacing } from '@/theme';

export interface BranchDraft {
  address: string;
  pin: Coordinates | null;
  opensAt: string;
  closesAt: string;
}

export const EMPTY_BRANCH: BranchDraft = { address: '', pin: null, opensAt: '', closesAt: '' };

/** The branch as the API takes it; without a pin the coordinates are left out, so the validator marks them. */
export function branchBody(branch: BranchDraft) {
  return {
    address: branch.address,
    latitude: branch.pin?.latitude as number,
    longitude: branch.pin?.longitude as number,
    opensAt: branch.opensAt,
    closesAt: branch.closesAt,
  };
}

interface BranchFormProps {
  title: string;
  value: BranchDraft;
  /**
   * Only the fields that changed. The screen applies them to its latest copy of the branch: the address lookup
   * answers after the pin has moved, and a whole branch built from an older render would put the old pin back.
   */
  onChange: (changed: Partial<BranchDraft>, edited: BranchField[]) => void;
  invalid: readonly BranchField[];
  testID: string;
}

export function BranchForm({ title, value, onChange, invalid, testID }: BranchFormProps) {
  const { t } = useTranslation();
  const has = (field: BranchField) => invalid.includes(field);
  const set = (patch: Partial<BranchDraft>, ...edited: BranchField[]) => {
    onChange(patch, edited);
  };

  return (
    <View testID={testID} style={styles.card}>
      <AppText variant="label">{title}</AppText>
      <LocationPicker
        pin={value.pin}
        onPinChange={(pin) => {
          set({ pin }, 'latitude', 'longitude');
        }}
        address={value.address}
        onAddressChange={(address) => {
          set({ address }, 'address');
        }}
        pinError={has('latitude') || has('longitude') ? t('errors.pinRequired') : undefined}
        addressError={has('address') ? t('errors.addressRequired') : undefined}
      />
      <TimeField
        testID={`${testID}-opens-at`}
        label={t('vendor.opensAtLabel')}
        value={value.opensAt === '' ? null : value.opensAt}
        onChange={(opensAt) => {
          set({ opensAt }, 'opensAt');
        }}
        error={has('opensAt') ? t(hoursErrorKey('opensAt', value.opensAt, value.closesAt)) : undefined}
      />
      <TimeField
        testID={`${testID}-closes-at`}
        label={t('vendor.closesAtLabel')}
        hint={t('vendor.hoursHint')}
        value={value.closesAt === '' ? null : value.closesAt}
        onChange={(closesAt) => {
          set({ closesAt }, 'closesAt');
        }}
        error={has('closesAt') ? t(hoursErrorKey('closesAt', value.opensAt, value.closesAt)) : undefined}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
