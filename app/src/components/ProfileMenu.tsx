// The customer's profile icon in the home header (D-94, asked for by Maryam on 2026-11-14): a person drawn with plain
// views (no icon font, like Log out, D-52) in a button of the same size. It opens a small menu with Active
// reservations, Past reservations (FR-RES-08) and Edit profile (FR-ACC-06, D-95). Screen readers read "Profile menu".
import { useState } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, minTouchSize, radius, spacing } from '@/theme';
import { AppText } from './AppText';

type Item = { key: 'active' | 'past' | 'zakat' | 'edit'; go: () => void };

export function ProfileMenu() {
  const { t } = useTranslation();
  const router = useRouter();
  const { direction } = useLanguage();
  const [open, setOpen] = useState(false);

  const choose = (go: () => void) => () => {
    setOpen(false);
    go();
  };
  const items: Item[] = [
    // The list route is app/reservations/index.tsx; written as a URL so it does not depend on the generated route
    // types (app/.expo/types, made by expo start and not in git).
    { key: 'active', go: () => router.push('/reservations?scope=active' as Href) },
    { key: 'past', go: () => router.push('/reservations?scope=past' as Href) },
    // US-43 (FR-TGI-06): the consumer's Zakat receipts.
    { key: 'zakat', go: () => router.push('/zakat' as Href) },
    { key: 'edit', go: () => router.push('/profile') },
  ];

  return (
    <>
      <Pressable
        testID="header-profile"
        accessibilityRole="button"
        accessibilityLabel={t('profile.menu')}
        hitSlop={4}
        onPress={() => {
          setOpen(true);
        }}
        style={({ pressed }) => [styles.button, pressed && styles.pressed]}
      >
        <View style={styles.icon} importantForAccessibility="no-hide-descendants">
          <View style={styles.head} />
          <View style={styles.body} />
        </View>
      </Pressable>
      <Modal
        visible={open}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setOpen(false);
        }}
      >
        <Pressable
          testID="profile-menu-close"
          accessibilityRole="button"
          accessibilityLabel={t('profile.close')}
          style={styles.backdrop}
          onPress={() => {
            setOpen(false);
          }}
        />
        <View testID="profile-menu" style={[styles.menu, { direction }]} accessibilityRole="menu">
          {items.map((item) => (
            <Pressable
              key={item.key}
              testID={`profile-menu-${item.key}`}
              accessibilityRole="menuitem"
              onPress={choose(item.go)}
              style={({ pressed }) => [styles.item, pressed && styles.pressed]}
            >
              <AppText>{t(`profile.${item.key}`)}</AppText>
            </Pressable>
          ))}
        </View>
      </Modal>
    </>
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
  icon: {
    width: ICON,
    height: ICON,
    alignItems: 'center',
  },
  head: {
    width: 10,
    height: 10,
    marginTop: 1,
    borderRadius: 5,
    borderWidth: LINE,
    borderColor: colors.primary,
  },
  body: {
    width: 18,
    height: 9,
    marginTop: 2,
    borderTopStartRadius: 9,
    borderTopEndRadius: 9,
    borderWidth: LINE,
    borderBottomWidth: 0,
    borderColor: colors.primary,
  },
  backdrop: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    start: 0,
    end: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
  },
  menu: {
    position: 'absolute',
    top: 72,
    end: spacing.lg,
    minWidth: 220,
    paddingVertical: spacing.xs,
    borderRadius: radius.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  item: {
    minHeight: minTouchSize,
    justifyContent: 'center',
    paddingHorizontal: spacing.lg,
  },
});
