// Jest setup for the app. AsyncStorage is replaced by its official in-memory mock.
// jest.mock factories run before imports, so the mock module has to be loaded with require().
jest.mock('@react-native-async-storage/async-storage', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  return require('@react-native-async-storage/async-storage/jest/async-storage-mock');
});

// C-24 Map View wraps a native map SDK that does not run in Jest. The mock is a button: pressing it places (or drags)
// the pin to 30.05, 31.25, the way a tap on the real map would.
jest.mock('@/components/MapView', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { Pressable } = require('react-native');
  const { createElement } = require('react');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    MapView: ({
      onPinChange,
      accessibilityLabel,
      testID,
    }: {
      onPinChange: (pin: { latitude: number; longitude: number }) => void;
      accessibilityLabel: string;
      testID?: string;
    }) =>
      createElement(Pressable, {
        testID: testID ?? 'map-view',
        accessibilityLabel,
        onPress: () => {
          onPinChange({ latitude: 30.05, longitude: 31.25 });
        },
      }),
  };
});
