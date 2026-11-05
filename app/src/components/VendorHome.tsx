// The Approved vendor's home (US-10, US-11, US-15): Create listing for formal vendors and Quick Post for informal vendors
// (FR-LST-02; since D-64 each vendor type sees only its own way to post), My listings (FR-LST-06) and the branches with
// their opening hours (D-62, D-64). The vendor type and hours come from GET /vendors/me, read again each time the home
// comes back into view; until they are known, neither way to post is shown.
import { useCallback, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useFocusEffect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getShop, type Shop } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from './AppText';
import { Button } from './Button';
import { Notice } from './Notice';
import { spacing } from '@/theme';

export function VendorHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { token } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);

  useFocusEffect(
    useCallback(() => {
      if (token === null) return;
      let active = true;
      void getShop(token)
        .then((result) => {
          if (active && result.kind === 'ok') setShop(result.shop);
        })
        .catch(() => undefined);
      return () => {
        active = false;
      };
    }, [token]),
  );

  // D-62: the hours are required; a vendor registered before that must set them before posting food.
  const hasHours = shop !== null && shop.opensAt !== null && shop.closesAt !== null;

  return (
    <View style={styles.content}>
      <AppText variant="heading" accessibilityRole="header">
        {shop?.shopName ?? t('vendorHome.title')}
      </AppText>
      <AppText color="textMuted">{t('home.vendor')}</AppText>
      {shop !== null && hasHours ? (
        <AppText testID="home-shop-hours" variant="label">
          {t('openingHours.current', { opensAt: shop.opensAt, closesAt: shop.closesAt })}
        </AppText>
      ) : null}
      {shop !== null && !hasHours ? (
        <Notice testID="home-hours-needed" tone="info" message={t('vendorHome.hoursNeeded')} />
      ) : null}
      {hasHours ? (
        <>
          {shop?.vendorType === 'formal' ? (
            <Button
              testID="home-create-listing"
              label={t('vendorHome.createListing')}
              accessibilityHint={t('vendorHome.createListingHint')}
              onPress={() => {
                router.push('/listings/new');
              }}
            />
          ) : null}
          {shop?.vendorType === 'informal' ? (
            <Button
              testID="home-quick-post"
              label={t('vendorHome.quickPost')}
              accessibilityHint={t('vendorHome.quickPostHint')}
              onPress={() => {
                router.push('/listings/quick');
              }}
            />
          ) : null}
        </>
      ) : null}
      <Button
        testID="home-my-listings"
        variant="secondary"
        label={t('vendorHome.myListings')}
        accessibilityHint={t('vendorHome.myListingsHint')}
        onPress={() => {
          router.push('/listings');
        }}
      />
      <Button
        testID="home-opening-hours"
        variant={hasHours ? 'secondary' : 'primary'}
        label={t('vendorHome.openingHours')}
        accessibilityHint={t('vendorHome.openingHoursHint')}
        onPress={() => {
          router.push('/vendor/hours');
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
});
