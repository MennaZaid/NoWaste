// NFR-06, decision D-67: in Arabic every number is shown with Arabic-Indic digits (٠١٢٣٤٥٦٧٨٩) and the Arabic decimal
// mark (٫); in English nothing changes. Used by the i18n post-processor for every translated text, and directly for
// numbers shown outside a translation (the bags counter, bags left, times).
import type { Language } from '@nowaste/shared';

const ARABIC_DIGITS = '٠١٢٣٤٥٦٧٨٩';

export function localDigits(value: string | number, language: Language): string {
  const text = String(value);
  if (language !== 'ar') return text;
  return text
    .replace(/(\d)\.(\d)/g, '$1٫$2')
    .replace(/[0-9]/g, (digit) => ARABIC_DIGITS[Number(digit)] ?? digit);
}
