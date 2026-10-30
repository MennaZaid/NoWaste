// FR-LST-01, E-LST-02: how the app sends a listing photo to POST /listings/photo (C-26). The server keeps only a body
// that starts with real JPEG bytes, so the app reads the compressed file's bytes itself and sends them. On a phone,
// sending a Blob made with fetch("file://...").blob() could arrive empty and be refused every time (found in phone
// testing, decision D-50). expo-file-system and fetch are native or network code, so both are replaced here.
import { uploadListingPhoto } from '@/api/client';

const JPEG_BYTES = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
const mockReadFile = jest.fn<Promise<ArrayBuffer>, [string]>();

jest.mock('expo-file-system', () => ({
  File: class {
    uri: string;
    constructor(uri: string) {
      this.uri = uri;
    }
    arrayBuffer() {
      return mockReadFile(this.uri);
    }
  },
}));

const fetchMock = jest.fn();

beforeEach(() => {
  process.env.EXPO_PUBLIC_API_URL = 'http://192.0.2.1:3000';
  mockReadFile.mockReset().mockResolvedValue(JPEG_BYTES.buffer.slice(0));
  fetchMock.mockReset().mockResolvedValue({ status: 201, json: async () => ({ photoKey: 'abc.jpg' }) });
  global.fetch = fetchMock as unknown as typeof fetch;
});

describe('FR-LST-01 listing photo upload', () => {
  test('FR-LST-01 the photo is sent as the JPEG file bytes with its type and the login token', async () => {
    const result = await uploadListingPhoto('token-1', 'file:///cache/small.jpg');

    expect(result).toEqual({ kind: 'ok', photoKey: 'abc.jpg' });
    expect(mockReadFile).toHaveBeenCalledWith('file:///cache/small.jpg');
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe('http://192.0.2.1:3000/listings/photo');
    expect(init.method).toBe('POST');
    expect(init.body).toBeInstanceOf(ArrayBuffer);
    expect([...new Uint8Array(init.body as ArrayBuffer)]).toEqual([...JPEG_BYTES]);
    const headers = new Headers(init.headers);
    expect(headers.get('Content-Type')).toBe('image/jpeg');
    expect(headers.get('Authorization')).toBe('Bearer token-1');
  });

  test('E-LST-02 a photo file that cannot be read is a failed upload and nothing is sent', async () => {
    mockReadFile.mockRejectedValue(new Error('no such file'));

    expect(await uploadListingPhoto('token-1', 'file:///cache/gone.jpg')).toEqual({ kind: 'failed' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('E-LST-02 no connection is a failed upload', async () => {
    fetchMock.mockRejectedValue(new TypeError('Network request failed'));

    expect(await uploadListingPhoto('token-1', 'file:///cache/small.jpg')).toEqual({ kind: 'failed' });
  });
});
