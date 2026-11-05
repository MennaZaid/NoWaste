// The device GPS position (IF-HW-03), shared by the vendor/partner location step (US-02, US-03) and the consumer map
// (US-26). IF-HW-04: when permission is denied or no position is found the caller explains why it is needed.
import * as Location from 'expo-location';
import type { Coordinates } from '@/components/MapView';

// Where a map opens when there is no GPS position: central Cairo (decision D-25; the consumer map since D-65).
export const FALLBACK_CENTER: Coordinates = { latitude: 30.0444, longitude: 31.2357 };

/** The device GPS position, or null when permission is denied or no position is found. */
export async function readDevicePosition(): Promise<Coordinates | null> {
  try {
    const permission = await Location.requestForegroundPermissionsAsync();
    if (permission.status !== 'granted') return null;
    const position = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: position.coords.latitude, longitude: position.coords.longitude };
  } catch {
    return null;
  }
}
