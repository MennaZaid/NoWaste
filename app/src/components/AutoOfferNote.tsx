// US-23 (FR-RTE-11, D-112): on the vendor's consumer listing, a note when its unreserved bags were offered to charities
// automatically (the push notification waits for the push adapter).
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { getListingAutoOffer } from '@/api/client';
import { Notice } from '@/components/Notice';
import { useLanguage } from '@/i18n/LanguageProvider';
import { formatDateTime } from '@/listings/formatDateTime';

export function AutoOfferNote({ token, listingId }: { token: string; listingId: string }) {
  const { t } = useTranslation();
  const { language } = useLanguage();
  const [offer, setOffer] = useState<{ offeredAt: string; bags: number } | null>(null);

  useEffect(() => {
    let active = true;
    void getListingAutoOffer(token, listingId).then((result) => {
      if (active && result.kind === 'ok') setOffer(result.offer);
    });
    return () => {
      active = false;
    };
  }, [token, listingId]);

  if (offer === null) return null;
  return (
    <Notice
      testID="auto-offer-note"
      tone="info"
      message={t('autoCharity.offered', {
        count: offer.bags,
        time: formatDateTime(offer.offeredAt, language),
      })}
    />
  );
}
