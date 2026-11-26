// US-44 (FR-TGI-07): opens the impact numbers from the vendor, partner and administrator homes. Customers open them
// from the profile menu (ProfileMenu).
import { useRouter, type Href } from 'expo-router';
import { useTranslation } from 'react-i18next';
import { Button } from './Button';

export function ImpactButton() {
  const { t } = useTranslation();
  const router = useRouter();
  return (
    <Button
      testID="home-impact"
      variant="secondary"
      label={t('impact.open')}
      onPress={() => {
        router.push('/impact' as Href);
      }}
    />
  );
}
