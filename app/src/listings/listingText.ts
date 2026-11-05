// A listing's name and description (D-66): stored exactly as the vendor wrote them, in Arabic or English, with no
// translation. The reader sees the text in their own language when it exists, otherwise as the vendor wrote it; a
// listing made before D-63 has only a food type.
import type { Language } from '@nowaste/shared';
import type { Listing } from '@/api/client';

export interface ListingText {
  name: string | null;
  description: string | null;
}

type TextFields = Pick<Listing, 'nameAr' | 'nameEn' | 'descriptionAr' | 'descriptionEn' | 'foodType'>;

export function listingText(listing: TextFields, language: Language): ListingText {
  const mine = language === 'ar';
  return {
    name:
      (mine ? listing.nameAr : listing.nameEn) ??
      (mine ? listing.nameEn : listing.nameAr) ??
      listing.foodType,
    description:
      (mine ? listing.descriptionAr : listing.descriptionEn) ??
      (mine ? listing.descriptionEn : listing.descriptionAr),
  };
}

/** D-66: the language a text is written in: Arabic when it has Arabic letters, otherwise English. */
export function textLanguageOf(text: string): Language {
  return /[؀-ۿ]/.test(text) ? 'ar' : 'en';
}
