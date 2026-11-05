// Branches and opening hours (decisions D-62 and D-64). The shop given at sign-up is the first branch; each branch has
// one opening and one closing time for every day (Egypt time), picked on the phone's clock. They are required and
// cannot be removed. A closing time earlier than the opening time means after midnight. A listing's pickup start must
// be inside the hours of its branch and its pick-by time is never after the closing time; a Quick Post must end by
// closing time. The vendor can add more branches here, each with its own pin and hours.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Redirect } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { validateBranch, validateOpeningHours, type BranchField } from '@nowaste/shared';
import { addBranch, getShop, updateBranchHours, updateOpeningHours, type Branch } from '@/api/client';
import { useAuth } from '@/auth/AuthProvider';
import { AppText } from '@/components/AppText';
import { BranchForm, EMPTY_BRANCH, branchBody, type BranchDraft } from '@/components/BranchForm';
import { Button } from '@/components/Button';
import { Notice } from '@/components/Notice';
import { Screen } from '@/components/Screen';
import { TimeField } from '@/components/TimeField';
import { useLanguage } from '@/i18n/LanguageProvider';
import { hoursErrorKey } from '@/listings/clockTime';
import { colors, radius, spacing } from '@/theme';

type Field = 'opensAt' | 'closesAt';
type Problem = 'unreachable' | 'unexpected';

/** The opening hours of one branch, saved on their own. The first (main) branch is saved through PATCH /vendors/me. */
function BranchHours({
  token,
  branch,
  main,
  onSessionEnded,
}: {
  token: string;
  branch: Branch;
  main: boolean;
  onSessionEnded: () => void;
}) {
  const { t } = useTranslation();
  const [opensAt, setOpensAt] = useState(branch.opensAt ?? '');
  const [closesAt, setClosesAt] = useState(branch.closesAt ?? '');
  const [invalid, setInvalid] = useState<Field[]>([]);
  const [problem, setProblem] = useState<Problem | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const id = main ? 'hours' : `branch-${branch.id}`;

  function edited(field: Field) {
    setInvalid((current) => current.filter((f) => f !== field));
    setSaved(false);
    setProblem(null);
  }

  async function save() {
    setSaved(false);
    setProblem(null);
    const check = validateOpeningHours({ opensAt, closesAt });
    if (!check.ok) {
      setInvalid(check.fields);
      return;
    }
    setInvalid([]);
    setSaving(true);
    const hours = { opensAt, closesAt };
    const result = main
      ? await updateOpeningHours(token, hours)
      : await updateBranchHours(token, branch.id, hours);
    setSaving(false);
    if (result.kind === 'ok') setSaved(true);
    else if (result.kind === 'invalid') setInvalid(result.fields);
    else if (result.kind === 'unauthorized' || result.kind === 'suspended') onSessionEnded();
    else setProblem(result.kind === 'unreachable' ? 'unreachable' : 'unexpected');
  }

  return (
    <View testID={`${id}-card`} style={styles.card}>
      {/* D-69: every branch carries the store name, so the address tells them apart. */}
      <AppText variant="label">{branch.address}</AppText>
      <TimeField
        testID={`${id}-opens-at`}
        label={t('openingHours.opensAtLabel')}
        value={opensAt === '' ? null : opensAt}
        onChange={(time) => {
          setOpensAt(time);
          edited('opensAt');
        }}
        error={invalid.includes('opensAt') ? t(hoursErrorKey('opensAt', opensAt, closesAt)) : undefined}
      />
      <TimeField
        testID={`${id}-closes-at`}
        label={t('openingHours.closesAtLabel')}
        hint={t('vendor.hoursHint')}
        value={closesAt === '' ? null : closesAt}
        onChange={(time) => {
          setClosesAt(time);
          edited('closesAt');
        }}
        error={invalid.includes('closesAt') ? t(hoursErrorKey('closesAt', opensAt, closesAt)) : undefined}
      />
      {saved ? <Notice tone="info" message={t('openingHours.saved')} /> : null}
      {problem !== null ? <Notice tone="error" message={t(`listing.problems.${problem}`)} /> : null}
      <Button
        testID={`${id}-save`}
        label={t('openingHours.save')}
        busyLabel={t('openingHours.saving')}
        busy={saving}
        onPress={() => void save()}
      />
    </View>
  );
}

export default function OpeningHoursScreen() {
  const { t } = useTranslation();
  const { direction } = useLanguage();
  const { token, signOut } = useAuth();
  const [loaded, setLoaded] = useState(false);
  const [branches, setBranches] = useState<Branch[]>([]);
  const [adding, setAdding] = useState(false);
  const [draft, setDraft] = useState<BranchDraft>(EMPTY_BRANCH);
  const [draftInvalid, setDraftInvalid] = useState<BranchField[]>([]);
  const [addProblem, setAddProblem] = useState<Problem | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (token === null) return;
    let active = true;
    void getShop(token).then((result) => {
      if (!active) return;
      if (result.kind === 'ok') {
        setBranches(result.shop.branches);
      } else if (result.kind === 'unauthorized' || result.kind === 'suspended') {
        void signOut();
        return;
      }
      setLoaded(true);
    });
    return () => {
      active = false;
    };
  }, [token, signOut]);

  if (token === null) return <Redirect href="/" />;
  const session = token;
  const sessionEnded = () => {
    void signOut();
  };

  async function saveBranch() {
    setAddProblem(null);
    const body = branchBody(draft);
    const check = validateBranch(body);
    if (!check.ok) {
      setDraftInvalid(check.fields);
      return;
    }
    setDraftInvalid([]);
    setSaving(true);
    const result = await addBranch(session, body);
    setSaving(false);
    if (result.kind === 'ok') {
      setBranches((current) => [...current, result.branch]);
      setDraft(EMPTY_BRANCH);
      setAdding(false);
    } else if (result.kind === 'invalid') {
      setDraftInvalid(result.fields as BranchField[]);
    } else if (result.kind === 'unauthorized' || result.kind === 'suspended') {
      await signOut();
    } else {
      setAddProblem(result.kind === 'unreachable' ? 'unreachable' : 'unexpected');
    }
  }

  return (
    <Screen scroll>
      <View testID="opening-hours-form" style={[styles.form, { direction }]}>
        <AppText variant="heading" accessibilityRole="header">
          {t('openingHours.title')}
        </AppText>
        <AppText color="textMuted">{t('openingHours.intro')}</AppText>
        {!loaded ? (
          <ActivityIndicator color={colors.primary} />
        ) : (
          <>
            {branches.map((branch, index) => (
              <BranchHours
                key={branch.id}
                token={session}
                branch={branch}
                main={index === 0}
                onSessionEnded={sessionEnded}
              />
            ))}
            {adding ? (
              <>
                <BranchForm
                  testID="new-branch"
                  title={t('branches.newTitle')}
                  value={draft}
                  invalid={draftInvalid}
                  onChange={(changed, edited) => {
                    setDraft((current) => ({ ...current, ...changed }));
                    setDraftInvalid((current) => current.filter((f) => !edited.includes(f)));
                    setAddProblem(null);
                  }}
                />
                {addProblem !== null ? (
                  <Notice tone="error" message={t(`listing.problems.${addProblem}`)} />
                ) : null}
                <Button
                  testID="new-branch-save"
                  label={t('branches.save')}
                  busyLabel={t('openingHours.saving')}
                  busy={saving}
                  onPress={() => void saveBranch()}
                />
              </>
            ) : (
              <Button
                testID="add-branch"
                variant="secondary"
                label={t('branches.add')}
                onPress={() => {
                  setAdding(true);
                }}
              />
            )}
          </>
        )}
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  form: {
    gap: spacing.lg,
  },
  card: {
    gap: spacing.md,
    padding: spacing.lg,
    borderRadius: radius.md,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
});
