// NFR-08a (SDD C-01, IF-COM-05): every listing photo is compressed to 500 KB or less before upload, so it goes
// through on a slow connection. First the photo is made smaller, then the JPEG quality is lowered step by step until
// the file fits. The limit comes from @nowaste/shared (PHOTO_MAX_BYTES), the same value the server checks.
import { SaveFormat, manipulateAsync } from 'expo-image-manipulator';
import { File } from 'expo-file-system';

/** The native steps, replaceable in tests (the real ones do not run in Jest). */
export interface PhotoTools {
  /** Re-encodes the photo as JPEG at most `width` pixels wide at the given quality; returns the new file. */
  shrink(uri: string, width: number, quality: number): Promise<string>;
  /** The file size in bytes, or null when it cannot be read. */
  sizeOf(uri: string): number | null;
}

const expoTools: PhotoTools = {
  async shrink(uri, width, quality) {
    const result = await manipulateAsync(uri, [{ resize: { width } }], {
      compress: quality,
      format: SaveFormat.JPEG,
    });
    return result.uri;
  },
  sizeOf(uri) {
    try {
      return new File(uri).size;
    } catch {
      return null;
    }
  },
};

// Wide enough to recognise the food, small enough for slow mobile data.
const WIDTHS = [1600, 1280, 1024, 800];
const QUALITIES = [0.8, 0.65, 0.5, 0.35];

/** Returns a JPEG of at most `maxBytes`, or null when the photo cannot be made that small. */
export async function compressPhoto(
  uri: string,
  maxBytes: number,
  tools: PhotoTools = expoTools,
): Promise<string | null> {
  for (const width of WIDTHS) {
    for (const quality of QUALITIES) {
      const out = await tools.shrink(uri, width, quality);
      const size = tools.sizeOf(out);
      if (size !== null && size <= maxBytes) return out;
    }
  }
  return null;
}
