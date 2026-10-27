import type { ListImage } from './model';

const ACCEPTED_TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_DIMENSION = 1000;

/** Decodes/re-encodes locally: no upload, external URL, or persistent blob URL. */
export async function prepareLocalImage(file: File): Promise<ListImage> {
  if (!ACCEPTED_TYPES.has(file.type)) throw new Error('Selecione imagens JPG, PNG ou WebP.');
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await new Promise<void>((resolve, reject) => {
      image.onload = () => resolve();
      image.onerror = () => reject(new Error('Esta imagem não pôde ser aberta. Escolha outro arquivo.'));
    });
    if (!image.naturalWidth || !image.naturalHeight) throw new Error('Imagem inválida.');
    const ratio = Math.min(1, MAX_DIMENSION / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.round(image.naturalWidth * ratio));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * ratio));
    const context = canvas.getContext('2d');
    if (!context) throw new Error('O navegador não conseguiu preparar a imagem.');
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    const dataUrl = canvas.toDataURL('image/webp', 0.8);
    return { id: crypto.randomUUID(), name: file.name.slice(0, 500) || 'Imagem', dataUrl };
  } finally { URL.revokeObjectURL(url); }
}
