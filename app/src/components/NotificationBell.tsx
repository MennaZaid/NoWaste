// US-34 (FR-RES-11, IF-SW-06, D-121): the bell in the consumer's header with the number of unread notifications. It
// checks every 30 s and whenever the home is shown again; it opens the notifications screen.
import { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { router, useFocusEffect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getNotifications } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { localDigits } from '@/i18n/digits';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, minTouchSize, radius } from '@/theme';
import { AppText } from './AppText';

const CHECK_MS = 30_000;

export function NotificationBell() {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { token } = useAuth();
  const [unread, setUnread] = useState(0);

  const load = useCallback(() => {
    if (token === null) return;
    void getNotifications(token).then((result) => {
      if (result.kind === 'ok') setUnread(result.unreadCount);
    });
  }, [token]);

  useEffect(() => {
    const timer = setInterval(load, CHECK_MS);
    return () => {
      clearInterval(timer);
    };
  }, [load]);
  useFocusEffect(load);

  return (
    <Pressable
      testID="header-notifications"
      accessibilityRole="button"
      accessibilityLabel={
        unread > 0 ? t('notifications.bellUnread', { count: unread }) : t('notifications.bell')
      }
      hitSlop={4}
      onPress={() => {
        router.push('/notifications');
      }}
      style={({ pressed }) => [styles.button, pressed && styles.pressed]}
    >
      <View style={styles.bell} importantForAccessibility="no-hide-descendants">
        <View style={styles.dome} />
        <View style={styles.clapper} />
      </View>
      {unread > 0 ? (
        <View testID="header-notifications-count" style={styles.badge}>
          <AppText variant="caption" color="onPrimary">
            {localDigits(unread > 9 ? 9 : unread, language)}
            {unread > 9 ? '+' : ''}
          </AppText>
        </View>
      ) : null}
    </Pressable>
  );
}

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
  bell: {
    alignItems: 'center',
  },
  dome: {
    width: 18,
    height: 16,
    borderTopStartRadius: 9,
    borderTopEndRadius: 9,
    borderWidth: 2,
    borderBottomWidth: 3,
    borderColor: colors.primary,
  },
  clapper: {
    width: 6,
    height: 4,
    marginTop: 1,
    borderBottomStartRadius: 3,
    borderBottomEndRadius: 3,
    backgroundColor: colors.primary,
  },
  badge: {
    position: 'absolute',
    top: 4,
    end: 4,
    minWidth: 18,
    paddingHorizontal: 4,
    borderRadius: 9,
    alignItems: 'center',
    backgroundColor: colors.error,
  },
});
