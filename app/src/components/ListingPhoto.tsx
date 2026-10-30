// The photo of the vendor's own listing (FR-LST-01), used by My listings and the listing screen (US-15, D-51).
// The photo is downloaded with the login token first (see downloadListingPhoto); until it arrives, or when it cannot
// be loaded, a plain box of the same size keeps the layout and the label.
import { useEffect, useState } from 'react';
import { Image, View, type ImageStyle, type StyleProp } from 'react-native';
import { useTranslation } from 'react-i18next';
import { downloadListingPhoto } from '@/api/client';

interface ListingPhotoProps {
  token: string;
  listingId: string;
  style: StyleProp<ImageStyle>;
  testID: string;
}

export function ListingPhoto({ token, listingId, style, testID }: ListingPhotoProps) {
  const { t } = useTranslation();
  const [uri, setUri] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    void downloadListingPhoto(token, listingId).then((local) => {
      if (active) setUri(local);
    });
    return () => {
      active = false;
    };
  }, [token, listingId]);

  if (uri === null) {
    return (
      <View
        testID={`${testID}-placeholder`}
        accessible
        accessibilityRole="image"
        accessibilityLabel={t('listing.photoLabel')}
        style={style}
      />
    );
  }
  return (
    <Image
      testID={testID}
      source={{ uri }}
      accessible
      accessibilityLabel={t('listing.photoLabel')}
      resizeMode="cover"
      style={style}
    />
  );
}
