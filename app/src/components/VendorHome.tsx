// The Approved vendor's home (US-10, US-11, US-15): Create listing for every vendor, Quick Post for informal vendors only
// (FR-LST-02) and My listings (FR-LST-06). The vendor type comes from GET /vendors/me; until it is known, Quick Post is
// not shown.
import { useEffect, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getShop, type Shop } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from './AppText';
import { Button } from './Button';
import { spacing } from '@/theme';

export function VendorHome() {
  const { t } = useTranslation();
  const router = useRouter();
  const { token } = useAuth();
  const [shop, setShop] = useState<Shop | null>(null);

  useEffect(() => {
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
  }, [token]);

  return (
    <View style={styles.content}>
      <AppText variant="heading" accessibilityRole="header">
        {shop?.shopName ?? t('vendorHome.title')}
      </AppText>
      <AppText color="textMuted">{t('home.vendor')}</AppText>
      <Button
        testID="home-create-listing"
        label={t('vendorHome.createListing')}
        accessibilityHint={t('vendorHome.createListingHint')}
        onPress={() => {
          router.push('/listings/new');
        }}
      />
      {shop?.vendorType === 'informal' ? (
        <Button
          testID="home-quick-post"
          variant="secondary"
          label={t('vendorHome.quickPost')}
          accessibilityHint={t('vendorHome.quickPostHint')}
          onPress={() => {
            router.push('/listings/quick');
          }}
        />
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
    </View>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
});
