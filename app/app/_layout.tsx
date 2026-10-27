// Root layout (expo-router). Loads the saved language before any screen renders (US-09), passes the layout
// direction to expo-router's LocaleProvider (headers, back arrows, swipe gestures) and puts the language switch
// in the header of every screen (FR-ACC-09, IF-UI-02, IF-UI-03).
import { LocaleProvider, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LanguageProvider, useLanguage } from '@/i18n/LanguageProvider';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { colors } from '@/theme';

function Navigator() {
  const { t } = useTranslation();
  const { direction } = useLanguage();

  return (
    <LocaleProvider direction={direction}>
      <View style={[styles.root, { direction }]}>
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.background },
            headerTintColor: colors.primary,
            headerTitleStyle: { color: colors.text, fontWeight: '700' },
            headerShadowVisible: false,
            headerBackButtonDisplayMode: 'minimal',
            contentStyle: { backgroundColor: colors.background },
            headerRight: () => <LanguageSwitch compact />,
          }}
        >
          {/* The Welcome screen has no header; its language switch is in the screen itself. */}
          <Stack.Screen
            name="index"
            options={{ headerShown: false, headerRight: () => null, title: t('welcome.title') }}
          />
          <Stack.Screen name="register" options={{ title: t('register.title') }} />
          <Stack.Screen
            name="registered"
            options={{ title: t('registered.title'), headerBackVisible: false, gestureEnabled: false }}
          />
          <Stack.Screen
            name="applied"
            options={{ title: t('applied.title'), headerBackVisible: false, gestureEnabled: false }}
          />
        </Stack>
        <StatusBar style="dark" />
      </View>
    </LocaleProvider>
  );
}

export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <LanguageProvider>
        <Navigator />
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});
