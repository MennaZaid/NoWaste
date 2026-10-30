// The listing photo (US-10, US-11): take one with the camera (IF-HW-01) or choose one from the gallery (IF-HW-02).
// The camera permission is asked the first time it is needed (IF-HW-06); if it is denied, the gallery still works
// (IF-HW-07). The picked photo is shown; it is compressed and uploaded when the listing is saved (NFR-08a).
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useTranslation } from 'react-i18next';
import { AppText } from './AppText';
import { Button } from './Button';
import { Notice } from './Notice';
import { colors, radius, spacing } from '@/theme';

interface PhotoPickerProps {
  uri: string | null;
  onPick: (uri: string) => void;
  error?: string;
}

export function PhotoPicker({ uri, onPick, error }: PhotoPickerProps) {
  const { t } = useTranslation();
  const [cameraDenied, setCameraDenied] = useState(false);

  async function pick(source: 'camera' | 'gallery') {
    if (source === 'camera') {
      const permission = await ImagePicker.requestCameraPermissionsAsync();
      if (!permission.granted) {
        setCameraDenied(true);
        return;
      }
    }
    setCameraDenied(false);
    const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 1 };
    const result =
      source === 'camera'
        ? await ImagePicker.launchCameraAsync(options)
        : await ImagePicker.launchImageLibraryAsync(options);
    const asset = result.canceled ? undefined : result.assets[0];
    if (asset !== undefined) onPick(asset.uri);
  }

  return (
    <View style={styles.container}>
      <AppText variant="label">{t('listing.photoLabel')}</AppText>
      {uri !== null ? (
        <Image
          testID="listing-photo-preview"
          source={{ uri }}
          style={styles.preview}
          accessible
          accessibilityLabel={t('listing.photoChosen')}
        />
      ) : (
        <AppText variant="caption" color={error !== undefined ? 'error' : 'textMuted'}>
          {error ?? t('listing.photoHint')}
        </AppText>
      )}
      {cameraDenied ? <Notice tone="info" message={t('listing.cameraDenied')} /> : null}
      <View style={styles.buttons}>
        <Button
          testID="photo-camera"
          variant="secondary"
          label={t('listing.takePhoto')}
          onPress={() => void pick('camera')}
        />
        <Button
          testID="photo-gallery"
          variant="secondary"
          label={t('listing.choosePhoto')}
          onPress={() => void pick('gallery')}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
  preview: {
    width: '100%',
    aspectRatio: 4 / 3,
    borderRadius: radius.md,
    backgroundColor: colors.accent,
  },
  buttons: {
    gap: spacing.sm,
  },
});
