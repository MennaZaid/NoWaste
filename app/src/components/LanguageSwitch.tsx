// US-09: English / العربية switch (FR-ACC-09, IF-UI-02). Shown on the Welcome screen and in every screen header.
// Each language name is written in its own language, so it can be found whatever language is active.
// Decision D-38: the switch itself is not mirrored. It always reads "English | العربية" from left to right, so the
// two options do not swap places when the language changes and the user can tap the same spot to switch back.
import { StyleSheet, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import type { Language } from '@nowaste/shared';
import { useLanguage } from '@/i18n/LanguageProvider';
import { SegmentedControl } from './SegmentedControl';

interface LanguageSwitchProps {
  tone?: 'light' | 'onDark';
  compact?: boolean;
}

export function LanguageSwitch({ tone = 'light', compact = false }: LanguageSwitchProps) {
  const { t } = useTranslation();
  const { language, setLanguage } = useLanguage();

  return (
    <View testID="language-switch" style={styles.fixedOrder}>
      <SegmentedControl<Language>
        options={[
          { value: 'en', label: t('language.en') },
          { value: 'ar', label: t('language.ar') },
        ]}
        value={language}
        onChange={(next) => {
          void setLanguage(next);
        }}
        accessibilityLabel={t('language.groupLabel')}
        accessibilityHint={t('language.optionHint')}
        tone={tone}
        compact={compact}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  fixedOrder: {
    direction: 'ltr',
  },
});
