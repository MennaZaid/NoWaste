// The header of the home screen of every role (US-04, IF-UI-02, IF-UI-03): the logo with Log out beside it at the
// start, the language switch at the end (decision D-42). Decision D-53: the home screen draws this bar itself instead
// of using the native navigation header, because on Android in Arabic the native header lost its start side (logo
// and Log out) and cut off the switch, so a logged-in user could not log out. As a normal row it follows the layout
// direction like every other screen: logo and Log out on the left in English and on the right in Arabic.
import { StyleSheet, View } from 'react-native';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, spacing } from '@/theme';
import { LanguageSwitch } from './LanguageSwitch';
import { Logo } from './Logo';
import { LogoutButton } from './LogoutButton';

export function HomeHeader() {
  const { direction } = useLanguage();

  return (
    <View testID="home-header" style={[styles.bar, { direction }]}>
      <View testID="home-header-start" style={styles.start}>
        <Logo width={44} />
        <LogoutButton />
      </View>
      <LanguageSwitch compact />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    backgroundColor: colors.background,
  },
  start: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
});
