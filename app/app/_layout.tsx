// Root layout (expo-router). Loads the saved language before any screen renders (US-09), passes the layout
// direction to expo-router's LocaleProvider (headers, back arrows, swipe gestures) and puts the language switch
// in the header of every screen (FR-ACC-09, IF-UI-02, IF-UI-03). When logged in, the header also has Log out (US-04).
import { LocaleProvider, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { StyleSheet, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { useTranslation } from 'react-i18next';
import { LanguageProvider, useLanguage } from '@/i18n/LanguageProvider';
import { LanguageSwitch } from '@/components/LanguageSwitch';
import { LogoutButton } from '@/components/LogoutButton';
import { Logo } from '@/components/Logo';
import { AuthProvider } from '@/auth/AuthProvider';
import { colors, spacing } from '@/theme';

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
            // D-42: the language switch is the last item, so it sits at the outer edge of the header (on the right
            // in English); Log out, when logged in, comes just before it.
            headerRight: () => (
              <View style={styles.headerActions}>
                <LogoutButton />
                <LanguageSwitch compact />
              </View>
            ),
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
          <Stack.Screen name="login" options={{ title: t('login.title') }} />
          <Stack.Screen
            name="home"
            // D-42: the home screen of every role shows the logo instead of the "NoWaste" title text (the title is
            // kept for screen readers and the app switcher). The logo sits at the start of the header with Log out
            // right beside it; the language switch alone is at the end (on the right in English).
            options={{
              title: t('home.title'),
              headerTitle: () => null,
              headerLeft: () => (
                <View testID="home-header-start" style={styles.headerActions}>
                  <Logo width={44} />
                  <LogoutButton />
                </View>
              ),
              headerRight: () => <LanguageSwitch compact />,
              headerBackVisible: false,
              gestureEnabled: false,
            }}
          />
          <Stack.Screen name="admin/[userId]" options={{ title: t('admin.detailsTitle') }} />
          <Stack.Screen name="listings/new" options={{ title: t('listing.title') }} />
          <Stack.Screen name="listings/quick" options={{ title: t('quickPost.title') }} />
          <Stack.Screen name="listings/[id]" options={{ title: t('listing.detailsTitle') }} />
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
        <AuthProvider>
          <Navigator />
        </AuthProvider>
      </LanguageProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
});
