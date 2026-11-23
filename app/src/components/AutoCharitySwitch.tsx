// US-23 (FR-RTE-11, D-112): the vendor turns automatic charity offers on or off. When on, the bags still unreserved a
// set time before a pickup ends (60 minutes, BR-10) are offered to charities as a Donation.
import { useEffect, useState } from 'react';
import { StyleSheet, Switch, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { getAutoCharity, setAutoCharity } from '@/api/client';
import { AppText } from './AppText';
import { colors, spacing } from '@/theme';

export function AutoCharitySwitch({ token }: { token: string }) {
  const { t } = useTranslation();
  const [on, setOn] = useState<boolean | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    void getAutoCharity(token).then((result) => {
      if (active && result.kind === 'ok') setOn(result.optIn);
    });
    return () => {
      active = false;
    };
  }, [token]);

  if (on === null) return null;

  return (
    <View testID="auto-charity" style={styles.box}>
      <View style={styles.row}>
        <AppText variant="label" style={styles.label}>
          {t('autoCharity.label')}
        </AppText>
        <Switch
          testID="auto-charity-switch"
          accessibilityLabel={t('autoCharity.label')}
          value={on}
          trackColor={{ true: colors.primary }}
          onValueChange={(value) => {
            setFailed(false);
            setOn(value);
            void setAutoCharity(token, value).then((result) => {
              if (result.kind === 'ok') setOn(result.optIn);
              else {
                setOn(!value);
                setFailed(true);
              }
            });
          }}
        />
      </View>
      <AppText variant="caption" color="textMuted">
        {t('autoCharity.hint')}
      </AppText>
      {failed ? (
        <AppText variant="caption" color="error">
          {t('autoCharity.failed')}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    gap: spacing.xs,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
  },
  label: {
    flex: 1,
  },
});
