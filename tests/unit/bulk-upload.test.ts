import { beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaError } from '@/lib/db/media';

const { addMedia } = vi.hoisted(() => ({ addMedia: vi.fn() }));
vi.mock('@/lib/db/media', async (importActual) => ({ ...(await importActual<typeof import('@/lib/db/media')>()), addMedia }));

const { fileKey, stageFiles, uploadBatch } = await import('@/lib/db/bulk-upload');

const file = (name: string, type = 'image/jpeg', size = 100, lastModified = 1) => new File([new Uint8Array(size)], name, { type, lastModified });

describe('stageFiles', () => {
  it('stages every usable file once and keeps the order', () => {
    const first = stageFiles([], [file('a.jpg'), file('b.png', 'image/png'), file('c.mp4', 'video/mp4')]);
    expect(first.files.map((f) => f.file.name)).toEqual(['a.jpg', 'b.png', 'c.mp4']);
    expect(first.rejected).toEqual([]);
    expect(first.duplicates).toBe(0);
  });

  it('counts the same file picked again as a duplicate and adds new ones to the list', () => {
    const first = stageFiles([], [file('a.jpg'), file('b.jpg')]);
    const again = stageFiles(first.files, [file('a.jpg'), file('c.jpg'), file('c.jpg')]);
    expect(again.files.map((f) => f.file.name)).toEqual(['a.jpg', 'b.jpg', 'c.jpg']);
    expect(again.duplicates).toBe(2);
  });

  it('tells two different photos with the same name apart (size or change date differs)', () => {
    expect(fileKey(file('IMG_1.jpg', 'image/jpeg', 100, 1))).not.toBe(fileKey(file('IMG_1.jpg', 'image/jpeg', 100, 2)));
    expect(stageFiles([], [file('IMG_1.jpg', 'image/jpeg', 100, 1), file('IMG_1.jpg', 'image/jpeg', 200, 1)]).files).toHaveLength(2);
  });

  it('refuses files that could never be uploaded, with the reason, and still stages the rest', () => {
    const result = stageFiles([], [file('virus.exe', 'application/x-msdownload'), file('leer.jpg', 'image/jpeg', 0), file('ok.jpg')]);
    expect(result.files.map((f) => f.file.name)).toEqual(['ok.jpg']);
    expect(result.rejected.map((r) => r.name)).toEqual(['virus.exe', 'leer.jpg']);
    expect(result.rejected[0]!.reason).toMatch(/Dateityp .* ist nicht erlaubt/);
    expect(result.rejected[1]!.reason).toMatch(/ist leer/);
  });
});

describe('uploadBatch', () => {
  beforeEach(() => {
    addMedia.mockReset(); // no return value: vitest would run a returned function as cleanup
  });
  const options = { familyId: 'f', tripId: 't', stopId: 'stop-1', album: '  Etosha ' };

  it('stores the files one after the other with album, station and capture date, and reports each result', async () => {
    addMedia.mockImplementation(async (o: { onProgress?: (p: number) => void }) => { o.onProgress?.(50); return {}; });
    const staged = stageFiles([], [file('a.jpg'), file('b.jpg')]).files;
    const started: string[] = [];
    const progress: [string, number][] = [];
    const done: boolean[] = [];
    const { results, wasCancelled } = await uploadBatch(staged, options, { onFileStart: (key, i, n) => started.push(`${i}/${n}`), onFileProgress: (key, p) => progress.push([key, p]), onFileDone: (r) => done.push(r.ok) });
    expect(results.map((r) => r.ok)).toEqual([true, true]);
    expect(wasCancelled).toBe(false);
    expect(started).toEqual(['1/2', '2/2']);
    expect(done).toEqual([true, true]);
    expect(progress).toHaveLength(2);
    expect(addMedia).toHaveBeenCalledTimes(2);
    expect(addMedia.mock.calls[0]![0]).toMatchObject({ familyId: 'f', tripId: 't', stopId: 'stop-1', album: 'Etosha', readExif: true });
    expect(addMedia.mock.calls[0]![0].file.name).toBe('a.jpg');
  });

  it('does not stop at a failing file: the others are stored and the failure carries its reason', async () => {
    addMedia.mockImplementation(async (o: { file: File }) => {
      if (o.file.name === 'kaputt.jpg') throw new MediaError('STORE_FAILED', '„kaputt.jpg“ konnte nicht gespeichert werden.');
      if (o.file.name === 'seltsam.jpg') throw new Error('Quota');
      return {};
    });
    const { results } = await uploadBatch(stageFiles([], [file('a.jpg'), file('kaputt.jpg'), file('seltsam.jpg'), file('z.jpg')]).files, options);
    expect(results.map((r) => r.ok)).toEqual([true, false, false, true]);
    expect(results[1]!.error).toBe('„kaputt.jpg“ konnte nicht gespeichert werden.');
    expect(results[2]!.error).toMatch(/seltsam\.jpg.*Quota/);
  });

  it('leaves the rest untouched when cancelled after the current file', async () => {
    const controller = new AbortController();
    addMedia.mockImplementation(async () => { controller.abort(); return {}; });
    const { results, wasCancelled } = await uploadBatch(stageFiles([], [file('a.jpg'), file('b.jpg'), file('c.jpg')]).files, options, { signal: controller.signal });
    expect(results).toHaveLength(1);
    expect(wasCancelled).toBe(true);
    expect(addMedia).toHaveBeenCalledTimes(1);
  });

  it('uses no album and no station when none is given', async () => {
    addMedia.mockResolvedValue({});
    await uploadBatch(stageFiles([], [file('a.jpg')]).files, { familyId: 'f', tripId: 't', album: '   ' });
    expect(addMedia.mock.calls[0]![0]).toMatchObject({ stopId: null, album: null });
  });
});
