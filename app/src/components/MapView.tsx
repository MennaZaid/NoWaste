// C-24 Map View (SDD 3.2.1): the only place that uses the map SDK (react-native-maps). Screens pass coordinates
// and get coordinates back, so the SDK can be swapped or mocked (tests replace this file in jest.setup.ts).
// Here it shows one pin that the user places by tapping the map and moves by dragging (US-02, US-03).
import { StyleSheet, View } from 'react-native';
import MapViewNative, { Marker, type LatLng } from 'react-native-maps';
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
