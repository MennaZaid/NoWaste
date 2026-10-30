// C-26 Storage Adapter (SDD 3.2.1): stores and fetches compressed listing photos (FR-LST-01, E-LST-02).
// Services use only the IStorage interface. Sprint 1 keeps the photos in a local folder; the cloud object storage
// (C-29) provider is still open (SRS TBD-2, open question 41), and a cloud adapter will implement the same interface.
import { randomUUID } from 'node:crypto';
import { access, mkdir, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

export type PhotoType = 'image/jpeg' | 'image/png';

export interface IStorage {
  /** Saves the photo and returns its key, for example "6f1c….jpg". */
  save(data: Buffer, type: PhotoType): Promise<string>;
  /** Whether a photo with this key exists. */
  exists(key: string): Promise<boolean>;
  /** The photo and its type, or undefined when there is no photo with this key. */
  read(key: string): Promise<{ data: Buffer; type: PhotoType } | undefined>;
}

const EXTENSION: Record<PhotoType, string> = { 'image/jpeg': 'jpg', 'image/png': 'png' };
// Keys are made here, so anything else (for example "../x") is never a stored photo.
const KEY = /^[0-9a-f-]{36}\.(jpg|png)$/;

/** Sprint 1 storage: one file per photo in a local folder. */
export function createLocalFolderStorage(folder: string): IStorage {
  return {
    async save(data, type) {
      await mkdir(folder, { recursive: true });
      const key = `${randomUUID()}.${EXTENSION[type]}`;
      await writeFile(join(folder, key), data);
      return key;
    },
    async exists(key) {
      if (!KEY.test(key)) return false;
      try {
        await access(join(folder, key));
        return true;
      } catch {
        return false;
      }
    },
    async read(key) {
      if (!KEY.test(key)) return undefined;
      try {
        const data = await readFile(join(folder, key));
        return { data, type: key.endsWith('.png') ? 'image/png' : 'image/jpeg' };
      } catch {
        return undefined;
      }
    },
  };
}

let storage: IStorage | undefined;

/**
 * The storage used by the services: server/uploads (git-ignored), or UPLOADS_DIR when set. Tests use a temporary
 * folder so they never write into the repo.
 */
export function getStorage(): IStorage {
  storage ??= createLocalFolderStorage(
    process.env.UPLOADS_DIR ??
      (process.env.NODE_ENV === 'test' ? join(tmpdir(), 'nowaste-test-uploads') : resolve('uploads')),
  );
  return storage;
}
