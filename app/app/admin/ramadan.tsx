// US-45 Ramadan mode (FR-TGI-08, decision D-107): the administrator sets the iftar and suhoor times (Cairo time) on
// the phone's clock. Consumers who turn on Ramadan mode see the offers whose pickup window comes before them.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect, useRouter } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { validateRamadanTimes, type RamadanTimesField } from '@nowaste/shared';
import { getRamadan, setRamadanTimes } from '@/api/client';
import { roleGroupOf, useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TimeField } from '@/components/TimeField';
import { useLanguage } from '@/i18n/LanguageProvider';
import { colors, spacing } from '@/theme';

type Message = { tone: 'info' | 'error'; key: string } | null;

export default function RamadanTimesScreen() {
  const { t } = useTranslation();
  const router = useRouter();
  const { direction } = useLanguage();
  const { token, user, sessionEnded } = useAuth();
  const [loading, setLoading] = useState(true);
  const [iftar, setIftar] = useState<string | null>(null);
  const [suhoor, setSuhoor] = useState<string | null>(null);
  const [leadMinutes, setLeadMinutes] = useState<number | null>(null);
  const [invalid, setInvalid] = useState<RamadanTimesField[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<Message>(null);

  useEffect(() => {
    if (token === null) return undefined;
    let active = true;
    void getRamadan(token).then(async (result) => {
      if (!active) return;
      setLoading(false);
      if (result.kind === 'ok') {
        setLeadMinutes(result.ramadan.leadMinutes);
        if (result.ramadan.set) {
          setIftar(result.ramadan.iftar);
          setSuhoor(result.ramadan.suhoor);
        }
      } else if (result.kind === 'unauthorized') {
        await sessionEnded();
        router.replace('/');
      } else {
        setMessage({ tone: 'error', key: 'ramadan.loadFailed' });
      }
    });
    return () => {
      active = false;
    };
  }, [token, sessionEnded, router]);

  if (token === null || (user !== null && roleGroupOf(user.role) !== 'admin'))
    return <Redirect href="/home" />;

  async function save() {
    if (token === null) return;
    const check = validateRamadanTimes({ iftar, suhoor });
    if (!check.ok) {
      setInvalid(check.fields);
      setMessage(null);
      return;
    }
    setInvalid([]);
    setBusy(true);
    const result = await setRamadanTimes(token, check.value);
    setBusy(false);
    if (result.kind === 'ok') setMessage({ tone: 'info', key: 'ramadan.saved' });
    else if (result.kind === 'invalid') setInvalid(result.fields);
    else if (result.kind === 'unauthorized') {
      await sessionEnded();
      router.replace('/');
    } else setMessage({ tone: 'error', key: 'ramadan.saveFailed' });
  }

  const errorOf = (field: RamadanTimesField) =>
    invalid.includes(field)
      ? t(
          field === 'suhoor' && iftar !== null && iftar === suhoor
            ? 'ramadan.sameTime'
            : 'ramadan.invalidTime',
        )
      : undefined;

  return (
    <Screen scroll>
      <View testID="admin-ramadan-screen" style={[styles.content, { direction }]}>
        <AppText variant="heading" accessibilityRole="header">
          {t('ramadan.adminTitle')}
        </AppText>
        <AppText color="textMuted">
          {leadMinutes === null
            ? t('ramadan.adminIntro')
            : t('ramadan.adminIntroLead', { hours: leadMinutes / 60 })}
        </AppText>
        {loading ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            <TimeField
              testID="ramadan-iftar"
              label={t('ramadan.iftar')}
              value={iftar}
              onChange={setIftar}
              error={errorOf('iftar')}
            />
            <TimeField
              testID="ramadan-suhoor"
              label={t('ramadan.suhoor')}
              value={suhoor}
              onChange={setSuhoor}
              error={errorOf('suhoor')}
            />
            <AppText variant="caption" color="textMuted">
              {t('ramadan.cairoTime')}
            </AppText>
            {message !== null ? <Notice tone={message.tone} message={t(message.key)} /> : null}
            <Button
              testID="ramadan-save"
              label={t('ramadan.save')}
              busy={busy}
              busyLabel={t('ramadan.saving')}
              onPress={() => {
                void save();
              }}
            />
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  content: {
    gap: spacing.lg,
  },
});
