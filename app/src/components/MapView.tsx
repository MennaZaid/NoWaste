// C-24 Map View (SDD 3.2.1): the only place that uses the map SDK (react-native-maps). Screens pass coordinates
// and get coordinates back, so the SDK can be swapped or mocked (tests replace this file in jest.setup.ts).
// MapView shows one pin that the user places by tapping the map and moves by dragging (US-02, US-03). OffersMap shows
// the consumer's position, the search circle and one pin per branch with offers (US-26, D-65).
import { useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import MapViewNative, { Circle, Marker, type LatLng } from 'react-native-maps';
import { colors, radius } from '@/theme';

export interface Coordinates {
  latitude: number;
  longitude: number;
}

interface MapViewProps {
  /** Where the map opens. Changing it moves the map there. */
  center: Coordinates;
  pin: Coordinates | null;
  onPinChange: (pin: Coordinates) => void;
  accessibilityLabel: string;
  testID?: string;
  /** Only shows the pin (for example to an administrator reviewing an application, US-07). */
  readOnly?: boolean;
}

// About 1 km across: close enough to put the pin on the right building.
const ZOOM = { latitudeDelta: 0.01, longitudeDelta: 0.01 };

function toCoordinates({ latitude, longitude }: LatLng): Coordinates {
  return { latitude, longitude };
}

export function MapView({
  center,
  pin,
  onPinChange,
  accessibilityLabel,
  testID,
  readOnly = false,
}: MapViewProps) {
  return (
    <View style={styles.frame} testID={testID}>
      <MapViewNative
        // A new key re-opens the map at the new centre (for example when the GPS position arrives).
        key={`${center.latitude},${center.longitude}`}
        style={StyleSheet.absoluteFill}
        initialRegion={{ ...center, ...ZOOM }}
        accessibilityLabel={accessibilityLabel}
        onPress={(event) => {
          if (!readOnly) onPinChange(toCoordinates(event.nativeEvent.coordinate));
        }}
      >
        {pin !== null ? (
          <Marker
            coordinate={pin}
            draggable={!readOnly}
            pinColor={colors.primary}
            onDragEnd={(event) => {
              onPinChange(toCoordinates(event.nativeEvent.coordinate));
            }}
          />
        ) : null}
      </MapViewNative>
    </View>
  );
}

const styles = StyleSheet.create({
  frame: {
    height: 260,
    borderRadius: radius.md,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.accent,
  },
});

export interface MapPlace {
  key: string;
  latitude: number;
  longitude: number;
  /** Shown on the pin and read by screen readers. */
  title: string;
  description: string;
  /** What a screen reader says for the pin, in the reading language. */
  accessibilityLabel: string;
}

interface OffersMapProps {
  /** The consumer's position (or the fallback centre); the circle is drawn around it. */
  center: Coordinates;
  /** The search distance: the map zooms so that this circle fits. */
  radiusKm: number;
  places: readonly MapPlace[];
  onSelectPlace: (key: string) => void;
  accessibilityLabel: string;
  /** Space covered by the bottom sheet: the map ends above it, so the circle is fitted into the part that shows. */
  bottomInset?: number;
}

const KM_PER_DEGREE = 111.2;

/** A region that shows a circle of `radiusKm` around `center`, with a small margin. */
export function regionFor(center: Coordinates, radiusKm: number) {
  const latitudeDelta = ((radiusKm * 2) / KM_PER_DEGREE) * 1.15;
  const longitudeDelta = latitudeDelta / Math.max(Math.cos((center.latitude * Math.PI) / 180), 0.1);
  return { ...center, latitudeDelta, longitudeDelta };
}

export function OffersMap({
  center,
  radiusKm,
  places,
  onSelectPlace,
  accessibilityLabel,
  bottomInset = 0,
}: OffersMapProps) {
  const map = useRef<MapViewNative>(null);

  // The slider zooms the map in and out; a new centre moves it.
  useEffect(() => {
    map.current?.animateToRegion(regionFor(center, radiusKm), 300);
  }, [center, radiusKm]);

  return (
    <MapViewNative
      ref={map}
      style={[StyleSheet.absoluteFill, { bottom: bottomInset }]}
      initialRegion={regionFor(center, radiusKm)}
      accessibilityLabel={accessibilityLabel}
      showsUserLocation
    >
      <Circle
        center={center}
        radius={radiusKm * 1000}
        strokeColor={colors.primary}
        fillColor="rgba(44, 95, 45, 0.08)"
      />
      {places.map((place) => (
        <Marker
          key={place.key}
          coordinate={{ latitude: place.latitude, longitude: place.longitude }}
          title={place.title}
          description={place.description}
          pinColor={colors.primary}
          accessibilityLabel={place.accessibilityLabel}
          onPress={() => {
            onSelectPlace(place.key);
          }}
        />
      ))}
    </MapViewNative>
  );
}
