// Location step of the vendor and partner applications (US-02, US-03): a map pin plus a written address
// (docs/feedback-changes.md). The pin starts at the device GPS location (IF-HW-03). If location permission is denied
// or no position is found, the app says why the location is needed and the user places the pin by hand (IF-HW-04,
// open question 32 / TBD-3). "Use my current location" asks again and puts the pin back there. The map itself is the C-24 MapView wrapper.
// The written address and the pin follow each other: when the pin is placed (GPS, tap or drag) its address is
// written into the field, and when the user finishes typing an address the pin and the map move to it.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import * as Location from 'expo-location';
import { useTranslation } from 'react-i18next';
import { AppText } from './AppText';
import { Button } from './Button';
import { MapView, type Coordinates } from './MapView';
import { Notice } from './Notice';
import { TextField } from './TextField';
import { useLanguage } from '@/i18n/LanguageProvider';
import { spacing } from '@/theme';

// Where the map opens when there is no GPS position: central Cairo (decision D-25). Only a starting view;
// nothing is saved until the user places the pin.
const FALLBACK_CENTER: Coordinates = { latitude: 30.0444, longitude: 31.2357 };

type GpsState = 'asking' | 'found' | 'unavailable';

/** The device GPS position, or null when permission is denied or no position is found. */
async function readDevicePosition(): Promise<Coordinates | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return null;
  }
}

// One line from the parts the device geocoder returns, for example "12 Tahrir Street, Dokki, Giza".
function formatAddress(found: Location.LocationGeocodedAddress): string {
  if (found.formattedAddress) return found.formattedAddress;
  const street = [found.streetNumber, found.street].filter(Boolean).join(' ');
  const parts = [street || found.name, found.district, found.city ?? found.subregion, found.region];
  return parts
    .filter((part, index): part is string => Boolean(part) && parts.indexOf(part) === index)
    .join(', ');
}

interface LocationPickerProps {
  pin: Coordinates | null;
  onPinChange: (pin: Coordinates) => void;
  address: string;
  onAddressChange: (address: string) => void;
  pinError?: string;
  addressError?: string;
}

export function LocationPicker({
  pin,
  onPinChange,
  address,
  onAddressChange,
  pinError,
  addressError,
}: LocationPickerProps) {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const [gps, setGps] = useState<GpsState>('asking');
  const [center, setCenter] = useState<Coordinates>(FALLBACK_CENTER);
  // The address written from the pin; the "check it" note shows until the user edits it.
  const [autoAddress, setAutoAddress] = useState<string | null>(null);
  const [addressNotFound, setAddressNotFound] = useState(false);
  // Only the newest lookup may change the pin or the address (an older, slower answer is ignored).
  const lookup = useRef(0);
  const lastSearched = useRef('');

  async function writeAddressOf(here: Coordinates) {
    const id = ++lookup.current;
    try {
      const [found] = await Location.reverseGeocodeAsync(here);
      if (id !== lookup.current || found === undefined) return;
      const text = formatAddress(found);
      if (text === '') return;
      lastSearched.current = text;
      setAutoAddress(text);
      setAddressNotFound(false);
      onAddressChange(text);
    } catch {
      // No address for this spot: the user types it.
    }
  }

  function placePin(here: Coordinates) {
    onPinChange(here);
    void writeAddressOf(here);
  }

  async function findAddress() {
    const text = address.trim();
    if (text === '' || text === lastSearched.current) return;
    lastSearched.current = text;
    const id = ++lookup.current;
    try {
      const [found] = await Location.geocodeAsync(text);
      if (id !== lookup.current) return;
      if (found === undefined) {
        setAddressNotFound(true);
        return;
      }
      const there = { latitude: found.latitude, longitude: found.longitude };
      setAddressNotFound(false);
      setCenter(there);
      onPinChange(there);
    } catch {
      if (id === lookup.current) setAddressNotFound(true);
    }
  }

  /**
   * Puts the pin at the device position, or says it is unavailable (IF-HW-03, IF-HW-04). On the first try the
   * address is written only into an empty field; after "Use my current location" it is always written.
   */
  function showPosition(here: Coordinates | null, firstTry: boolean) {
    if (here === null) {
      setGps('unavailable');
      return;
    }
    setCenter(here);
    setGps('found');
    // The location is used only to place the pin; the user can still move it.
    onPinChange(here);
    if (!firstTry || address.trim() === '') void writeAddressOf(here);
  }

  useEffect(() => {
    let active = true;
    void readDevicePosition().then((here) => {
      if (active) showPosition(here, true);
    });
    return () => {
      active = false;
    };
    // Ask once, when the location step appears.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <View testID="location-picker" style={[styles.container, { direction }]}>
      <AppText variant="label">{t('location.title')}</AppText>
      <AppText variant="caption" color="textMuted">
        {t('location.instructions')}
      </AppText>
      {gps === 'unavailable' ? <Notice tone="info" message={t('location.permissionDenied')} /> : null}
      <MapView
        testID="map-view"
        center={center}
        pin={pin}
        onPinChange={placePin}
        accessibilityLabel={t('location.mapLabel')}
      />
      <Button
        testID="location-detect"
        variant="secondary"
        label={t('location.detect')}
        busyLabel={t('location.detecting')}
        busy={gps === 'asking'}
        accessibilityHint={t('location.detectHint')}
        onPress={() => {
          setGps('asking');
          void readDevicePosition().then((here) => {
            showPosition(here, false);
          });
        }}
      />
      <AppText
        variant="caption"
        color={pinError !== undefined ? 'error' : 'textMuted'}
        accessibilityLiveRegion="polite"
      >
        {pinError ??
          (pin === null
            ? t('location.noPin')
            : t('location.pinAt', {
                latitude: pin.latitude.toFixed(5),
                longitude: pin.longitude.toFixed(5),
              }))}
      </AppText>
      <TextField
        testID="register-address"
        label={t('location.addressLabel')}
        placeholder={t('location.addressPlaceholder')}
        value={address}
        onChangeText={(text) => {
          setAddressNotFound(false);
          onAddressChange(text);
        }}
        onBlur={() => void findAddress()}
        onSubmitEditing={() => void findAddress()}
        returnKeyType="search"
        error={addressError}
        hint={autoAddress !== null && address === autoAddress ? t('location.addressFromPin') : undefined}
        autoComplete="street-address"
        textContentType="fullStreetAddress"
      />
      {addressNotFound ? <Notice tone="info" message={t('location.addressNotFound')} /> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    gap: spacing.sm,
  },
});
