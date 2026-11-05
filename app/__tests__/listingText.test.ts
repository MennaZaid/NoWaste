// D-66: listing text is shown as the vendor wrote it, and its language is read from the text (FR-LST-01, FR-LST-02).
import { listingText, textLanguageOf } from '@/listings/listingText';

const empty = { nameAr: null, nameEn: null, descriptionAr: null, descriptionEn: null, foodType: null };

describe('FR-LST-01 D-66 the language of a text', () => {
  test.each([
    ['Koshari with crispy onions', 'en'],
    ['كشري بالبصل المقرمش', 'ar'],
    ['Koshari كشري', 'ar'],
    ['٣ أكياس', 'ar'],
    ['123', 'en'],
  ])('FR-LST-01 "%s" is %s', (text, language) => {
    expect(textLanguageOf(text)).toBe(language);
  });
});

describe('FR-LST-01 D-66 the text a reader sees', () => {
  test('FR-LST-01 text written in Arabic is shown as written to an English reader', () => {
    expect(listingText({ ...empty, nameAr: 'كشري', descriptionAr: 'طازج' }, 'en')).toEqual({
      name: 'كشري',
      description: 'طازج',
    });
  });

  test('FR-LST-01 text written in English is shown as written to an Arabic reader', () => {
    expect(listingText({ ...empty, nameEn: 'Koshari', descriptionEn: 'Fresh' }, 'ar')).toEqual({
      name: 'Koshari',
      description: 'Fresh',
    });
  });

  test('FR-LST-01 a listing from before D-63 shows its food type and its description in the reader language', () => {
    const old = { ...empty, foodType: 'Baladi bread', descriptionAr: 'عيش', descriptionEn: 'Bread' };

    expect(listingText(old, 'ar')).toEqual({ name: 'Baladi bread', description: 'عيش' });
    expect(listingText(old, 'en')).toEqual({ name: 'Baladi bread', description: 'Bread' });
  });
});
