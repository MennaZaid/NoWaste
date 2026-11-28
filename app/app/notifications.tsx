// US-34 (FR-RES-11, IF-SW-06, D-121): the consumer's notifications, newest first: reservation confirmed, released,
// a waitlisted bag set aside for them, and the pickup window open. The text is written here in the app's language from
// the notification's data (NFR-06). Opening the screen marks them read; a notification opens its reservation or offer.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Redirect, Stack, router } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { getNotifications, readNotifications, type AppNotification } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime, formatTime } from '@/listings/formatDateTime';
import { colors, minTouchSize, radius, spacing } from '@/theme';

export default function NotificationsScreen() {
  const { t } = useTranslation();
  const { direction, language } = useLanguage();
  const { token, signOut } = useAuth();
  const [items, setItems] = useState<AppNotification[] | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (token === null) return;
    let active = true;
    void getNotifications(token).then((result) => {
      if (!active) return;
      if (result.kind === 'ok') {
        setItems(result.notifications);
        if (result.unreadCount > 0) void readNotifications(token);
      } else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
      else setFailed(true);
    });
    return () => {
      active = false;
    };
  }, [token, signOut]);

  if (token === null) return <Redirect href="/" />;

  const textOf = (n: AppNotification) => {
    const mine = language === 'ar' ? n.data.nameAr : n.data.nameEn;
    const other = language === 'ar' ? n.data.nameEn : n.data.nameAr;
    const name = mine ?? other ?? t('quickPost.title');
    const shop = n.data.shopName ?? '';
    const time = n.data.offerExpiresAt === undefined ? '' : formatTime(n.data.offerExpiresAt, language);
    return t(`notifications.kinds.${n.kind}`, { name, shop, time });
  };

  const open = (n: AppNotification) => {
    if (n.kind === 'waitlist_offer' && n.data.listingId !== undefined) {
      router.push({
        pathname: '/offers/[id]',
        params: { id: n.data.listingId, ...(n.data.entryId === undefined ? {} : { entry: n.data.entryId }) },
      });
    } else if (n.data.reservationId !== undefined) {
      router.push({ pathname: '/reservations/[id]', params: { id: n.data.reservationId } });
    }
  };

  return (
    <Screen scroll>
      <Stack.Screen options={{ title: t('notifications.title') }} />
      <View testID="notifications" style={[styles.content, { direction }]}>
        {failed ? <Notice tone="error" message={t('notifications.failed')} /> : null}
        {items === null && !failed ? <ActivityIndicator color={colors.primary} /> : null}
        {items !== null && items.length === 0 ? (
          <AppText color="textMuted">{t('notifications.empty')}</AppText>
        ) : null}
        {items?.map((n) => (
          <Pressable
            key={n.id}
            testID={`notification-${n.id}`}
            accessibilityRole="button"
            onPress={() => {
              open(n);
            }}
            style={({ pressed }) => [styles.card, !n.read && styles.unread, pressed && styles.pressed]}
          >
            <AppText variant={n.read ? 'body' : 'label'}>{textOf(n)}</AppText>
            <AppText variant="caption" color="textMuted">
              {formatDateTime(n.createdAt, language)}
            </AppText>
          </Pressable>
        ))}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.md,
  },
  card: {
    minHeight: minTouchSize,
    gap: spacing.xs,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  unread: {
    borderColor: colors.primary,
  },
  pressed: {
    backgroundColor: colors.accent,
  },
});
