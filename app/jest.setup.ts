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

// expo-secure-store keeps the login token in the device keychain (US-04). In Jest it is an in-memory map that each
// test file starts empty; __secureStore lets tests look inside.
jest.mock('expo-secure-store', () => {
  const store = new Map<string, string>();
  return {
    __secureStore: store,
    getItemAsync: jest.fn((key: string) => Promise.resolve(store.get(key) ?? null)),
    setItemAsync: jest.fn((key: string, value: string) => {
      store.set(key, value);
      return Promise.resolve();
    }),
    deleteItemAsync: jest.fn((key: string) => {
      store.delete(key);
      return Promise.resolve();
    }),
  };
});

// The date-and-time field opens the phone's native picker, which does not run in Jest. The mock is a text input with
// the same label: tests type an ISO time into it.
jest.mock('@/components/DateTimeField', () => {
  /* eslint-disable @typescript-eslint/no-require-imports */
  const { TextInput } = require('react-native');
  const { createElement } = require('react');
  /* eslint-enable @typescript-eslint/no-require-imports */
  return {
    DateTimeField: ({
      label,
      value,
      onChange,
      error,
      disabled,
      testID,
    }: {
      label: string;
      value: string | null;
      onChange: (iso: string) => void;
      error?: string;
      disabled?: boolean;
      testID?: string;
    }) =>
      createElement(TextInput, {
        testID,
        accessibilityLabel: label,
        accessibilityHint: error,
        editable: !disabled,
        value: value ?? '',
        onChangeText: onChange,
      }),
  };
});
