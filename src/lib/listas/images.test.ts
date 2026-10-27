import { afterEach, describe, expect, it, vi } from 'vitest';
import { prepareLocalImage } from './images';

afterEach(() => vi.restoreAllMocks());

describe('local-only image preparation', () => {
  it('rejects unsupported file types before attempting decoding', async () => {
    const objectUrl = vi.spyOn(URL, 'createObjectURL');
    await expect(prepareLocalImage(new File(['<svg/>'], 'bad.svg', { type: 'image/svg+xml' }))).rejects.toThrow('JPG, PNG ou WebP');
    expect(objectUrl).not.toHaveBeenCalled();
  });

  it('persists a resized data URL and releases its temporary blob URL', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:only-temporary');
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    class ImageMock {
      naturalWidth = 2000;
      naturalHeight = 1000;
      onload?: () => void;
      onerror?: () => void;
      set src(_url: string) { queueMicrotask(() => this.onload?.()); }
    }
    vi.stubGlobal('Image', ImageMock);
    const drawImage = vi.fn();
    const getContext = vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue({ drawImage } as unknown as CanvasRenderingContext2D);
    const toDataURL = vi.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockReturnValue('data:image/webp;base64,YWJj');
    try {
      const result = await prepareLocalImage(new File(['content'], 'photo.png', { type: 'image/png' }));
      expect(result.name).toBe('photo.png');
      expect(result.dataUrl).toBe('data:image/webp;base64,YWJj');
      const canvas = getContext.mock.instances[0] as HTMLCanvasElement;
      expect(canvas.width).toBe(1000);
      expect(canvas.height).toBe(500);
      expect(drawImage).toHaveBeenCalledOnce();
      expect(toDataURL).toHaveBeenCalledWith('image/webp', 0.8);
      expect(revoked).toHaveBeenCalledWith('blob:only-temporary');
    } finally { vi.unstubAllGlobals(); }
  });

  it('releases the temporary URL even if decoding fails', async () => {
    vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:bad');
    const revoked = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
    class ImageMock {
      onload?: () => void;
      onerror?: () => void;
      set src(_url: string) { queueMicrotask(() => this.onerror?.()); }
    }
    vi.stubGlobal('Image', ImageMock);
    try {
      await expect(prepareLocalImage(new File(['broken'], 'bad.png', { type: 'image/png' }))).rejects.toThrow('não pôde ser aberta');
      expect(revoked).toHaveBeenCalledWith('blob:bad');
    } finally { vi.unstubAllGlobals(); }
  });
});
