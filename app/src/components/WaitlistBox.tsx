// US-29 (FR-RES-06, E-RES-02, D-117 to D-119): on the offer page, the waitlist part. When every bag is reserved the
// consumer can join; while waiting they see their number and can leave; when a bag is set aside for them they see
// until when, reserve it with the normal buttons (the page passes the entry id), or pass it on.
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { declineWaitlistOffer, joinWaitlist, leaveWaitlist, type WaitlistEntry } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { localDigits } from '@/i18n/digits';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatTime } from '@/listings/formatDateTime';
import { spacing } from '@/theme';
import { AppText } from './AppText';
import { Button } from './Button';
import { Notice } from './Notice';

export function WaitlistBox({
  listingId,
  soldOut,
  entry,
  onChange,
}: {
  listingId: string;
  soldOut: boolean;
  entry: WaitlistEntry | null;
  onChange: (next: WaitlistEntry | null) => void;
}) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const { token, signOut } = useAuth();
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ tone: 'info' | 'error'; key: string } | null>(null);

  async function act(kind: 'join' | 'leave' | 'decline') {
    if (token === null) return;
    setBusy(true);
    setNote(null);
    const result =
      kind === 'join'
        ? await joinWaitlist(token, listingId)
        : kind === 'leave'
          ? await leaveWaitlist(token, entry?.id ?? '')
          : await declineWaitlistOffer(token, entry?.id ?? '');
    setBusy(false);
    if (result.kind === 'ok') {
      if (kind === 'join') onChange(result.entry);
      else {
        onChange(null);
        setNote({ tone: 'info', key: kind === 'leave' ? 'waitlist.left' : 'waitlist.declined' });
      }
    } else if (result.kind === 'unauthorized' || result.kind === 'suspended') void signOut();
    else setNote({ tone: 'error', key: 'waitlist.failed' });
  }

  const offered = entry?.status === 'Offered' && entry.offerExpiresAt !== null;
  const waiting = entry?.status === 'Waiting';

  return (
    <View testID="waitlist-box" style={styles.box}>
      {note !== null ? <Notice testID="waitlist-note" tone={note.tone} message={t(note.key)} /> : null}
      {offered ? (
        <>
          <Notice
            testID="waitlist-offered"
            tone="info"
            title={t('waitlist.offeredTitle')}
            message={t('waitlist.offeredUntil', { time: formatTime(entry.offerExpiresAt ?? '', language) })}
          />
          <Button
            testID="waitlist-decline"
            variant="secondary"
            label={t('waitlist.decline')}
            busy={busy}
            onPress={() => void act('decline')}
          />
        </>
      ) : null}
      {waiting ? (
        <>
          <AppText testID="waitlist-position">
            {t('waitlist.position', { position: localDigits(entry.position ?? 1, language) })}
          </AppText>
          <Button
            testID="waitlist-leave"
            variant="secondary"
            label={t('waitlist.leave')}
            busy={busy}
            onPress={() => void act('leave')}
          />
        </>
      ) : null}
      {soldOut && !offered && !waiting ? (
        <>
          <AppText color="textMuted">{t('waitlist.soldOutHint')}</AppText>
          <Button
            testID="waitlist-join"
            label={t('waitlist.join')}
            busy={busy}
            busyLabel={t('waitlist.joining')}
            onPress={() => void act('join')}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.sm,
  },
});
