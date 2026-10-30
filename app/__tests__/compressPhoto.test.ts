// NFR-08a: the app compresses each listing photo to 500 KB or less before upload (SDD C-01, IF-COM-05).
// The real resizing is native code (expo-image-manipulator) that does not run in Jest, so these tests give
// compressPhoto a stand-in whose output size follows the picture's pixels and the JPEG quality, starting from a 5 MB
// camera photo. The real compression on a phone is checked by hand (see PROGRESS.md, Turn 4 phone checks).
import { PHOTO_MAX_BYTES } from '@nowaste/shared';
import { compressPhoto, type PhotoTools } from '@/listings/compressPhoto';

const FIVE_MB = 5 * 1024 * 1024;

/** A 4000 × 3000 camera photo of 5 MB. Output bytes ≈ pixels × quality × 0.5, never more than the original. */
function fakeTools(original = { width: 4000, height: 3000, bytes: FIVE_MB }) {
  const sizes = new Map<string, number>([['file:///camera.jpg', original.bytes]]);
  const calls: { width: number; quality: number }[] = [];
  const tools: PhotoTools = {
    async shrink(_uri, width, quality) {
      calls.push({ width, quality });
      const w = Math.min(width, original.width);
      const h = Math.round((original.height * w) / original.width);
      const uri = `file:///out-${calls.length}.jpg`;
      sizes.set(uri, Math.min(original.bytes, Math.round(w * h * quality * 0.5)));
      return uri;
    },
    sizeOf: (uri) => sizes.get(uri) ?? null,
  };
  return { tools, calls, sizes };
}

describe('NFR-08a listing photos are compressed to 500 KB or less', () => {
  test('NFR-08a a 5 MB test image comes out at 500 KB or less', async () => {
    const { tools, sizes } = fakeTools();
    expect(sizes.get('file:///camera.jpg')).toBe(FIVE_MB);

    const result = await compressPhoto('file:///camera.jpg', PHOTO_MAX_BYTES, tools);

    expect(result).not.toBeNull();
    expect(sizes.get(result!)).toBeLessThanOrEqual(PHOTO_MAX_BYTES);
  });

  test('NFR-08a it resizes first, then lowers the quality step by step until the photo fits', async () => {
    const { tools, calls } = fakeTools();

    await compressPhoto('file:///camera.jpg', PHOTO_MAX_BYTES, tools);

    expect(calls[0]).toEqual({ width: 1600, quality: 0.8 });
    const qualities = calls.map((call) => call.quality);
    expect([...qualities].sort((a, b) => b - a)).toEqual(qualities);
  });

  test('NFR-08a a small photo is still re-encoded once and kept at the first try', async () => {
    const { tools, calls, sizes } = fakeTools({ width: 800, height: 600, bytes: 90 * 1024 });

    const result = await compressPhoto('file:///camera.jpg', PHOTO_MAX_BYTES, tools);

    expect(calls).toHaveLength(1);
    expect(sizes.get(result!)).toBeLessThanOrEqual(PHOTO_MAX_BYTES);
  });

  test('NFR-08a when no step gets the photo small enough, the app gets null and uploads nothing', async () => {
    const tools: PhotoTools = {
      shrink: async (_uri, width, quality) => `file:///big-${width}-${quality}.jpg`,
      sizeOf: () => PHOTO_MAX_BYTES + 1,
    };

    expect(await compressPhoto('file:///camera.jpg', PHOTO_MAX_BYTES, tools)).toBeNull();
  });

  test('NFR-08a a photo whose size cannot be read is not treated as small enough', async () => {
    const tools: PhotoTools = { shrink: async () => 'file:///x.jpg', sizeOf: () => null };

    expect(await compressPhoto('file:///camera.jpg', PHOTO_MAX_BYTES, tools)).toBeNull();
  });
});
