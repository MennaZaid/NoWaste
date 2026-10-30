// US-04: Log out in the header of every screen while logged in (FR-ACC-04, IF-COM-03). It ends the session on the
// server, forgets the token on the phone and returns to the Welcome screen.
// Decision D-52: Log out is an icon (a door with an arrow leaving it) in a button of one fixed size, because the
// Arabic text "تسجيل الخروج" plus the language switch did not fit in the header and Android cut Log out off. Screen
// readers still read "Log out" / "تسجيل الخروج". The arrow points out of the door towards the end of the line, so it
// is mirrored in Arabic. The icon is drawn with plain views, so no icon font has to load.
import { Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/auth/AuthProvider';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, minTouchSize, radius } from '@/theme';

export function LogoutButton() {
  const { t } = useTranslation();
  const router = useRouter();
  const { direction } = useLanguage();
  const { token, signOut } = useAuth();
  if (token === null) return null;

  return (
    <Pressable
      testID="header-logout"
      accessibilityRole="button"
      accessibilityLabel={t('session.logout')}
      accessibilityHint={t('session.logoutHint')}
      hitSlop={4}
      onPress={() => {
        void signOut().then(() => {
          router.dismissTo('/');
        });
      }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <View
        style={[styles.icon, direction === 'rtl' && styles.mirrored]}
        importantForAccessibility="no-hide-descendants"
      >
        <View style={styles.door} />
        <View style={styles.shaft} />
        <View style={styles.head} />
      </View>
    </Pressable>
  );
}

const ICON = 24;
const LINE = 2;

const styles = StyleSheet.create({
  button: {
    width: minTouchSize,
    height: minTouchSize,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.md,
  },
  pressed: {
    backgroundColor: colors.accent,
  },
  // Drawn left to right; mirrored as a whole in Arabic.
  icon: {
    width: ICON,
    height: ICON,
    direction: 'ltr',
  },
  mirrored: {
    transform: [{ scaleX: -1 }],
  },
  // The door: a frame open on the side the arrow leaves through.
  door: {
    position: 'absolute',
    start: 2,
    top: 3,
    width: 11,
    height: 18,
    borderWidth: LINE,
    borderEndWidth: 0,
    borderColor: colors.primary,
    borderTopStartRadius: 2,
    borderBottomStartRadius: 2,
  },
  shaft: {
    position: 'absolute',
    start: 8,
    top: (ICON - LINE) / 2,
    width: 13,
    height: LINE,
    backgroundColor: colors.primary,
  },
  // The arrow head: two sides of a square, turned 45 degrees.
  head: {
    position: 'absolute',
    start: 14,
    top: ICON / 2 - 4,
    width: 8,
    height: 8,
    borderTopWidth: LINE,
    borderEndWidth: LINE,
    borderColor: colors.primary,
    transform: [{ rotate: '45deg' }],
  },
});
