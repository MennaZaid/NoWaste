// Small helpers shared by the listing form (US-10, US-13) and Quick Post (US-11).
import { PHOTO_MAX_BYTES } from '@nowaste/shared';
import { uploadListingPhoto } from '@/api/client';
import { compressPhoto } from './compressPhoto';

/** A number typed in the form, also with Arabic-Indic digits and the Arabic decimal mark; undefined if not a number. */
export function parseAmount(text: string): number | undefined {
  const latin = text
    .trim()
    .replace(/[٠-٩]/g, (d) => String(d.charCodeAt(0) - 0x0660))
    .replace(/[٫,]/g, '.');
  if (latin === '' || !/^-?\d+(\.\d+)?$/.test(latin)) return undefined;
  return Number(latin);
}

export type PhotoUpload =
  | { kind: 'ok'; photoKey: string }
  | { kind: 'failed' } // E-LST-02: offer Retry, keep the form
  | { kind: 'tooLarge' } // NFR-08a: could not be compressed to the limit
  | { kind: 'notApproved' } // E-LST-06
  | { kind: 'unauthorized' }
  | { kind: 'suspended' };

/** Compresses the photo to the NFR-08a limit, then uploads it (C-26). */
export async function preparePhoto(token: string, uri: string): Promise<PhotoUpload> {
  let small: string | null;
  try {
    small = await compressPhoto(uri, PHOTO_MAX_BYTES);
  } catch {
    return { kind: 'failed' };
  }
  if (small === null) return { kind: 'tooLarge' };
  const result = await uploadListingPhoto(token, small);
  // No connection or an unexpected answer is a failed upload: the form offers Retry (E-LST-02).
  return result.kind === 'unreachable' || result.kind === 'unexpected' ? { kind: 'failed' } : result;
}
