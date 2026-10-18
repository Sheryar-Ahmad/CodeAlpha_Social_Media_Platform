import { mkdir, writeFile, unlink } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { HttpError } from './validation.js';

export async function prepareImage(value, directory, previous = null) {
  if (value === null || value === previous) return { url: value, created: false };
  const match = /^data:image\/(jpeg|png|webp|gif);base64,([A-Za-z0-9+/=]+)$/.exec(value);
  if (!match) throw new HttpError(400, 'Choose a supported photo file.');
  const input = Buffer.from(match[2], 'base64');
  if (!input.length || input.length > 2 * 1024 * 1024)
    throw new HttpError(400, 'Choose an image smaller than 2 MB.');
  let output;
  try {
    const image = sharp(input, { limitInputPixels: 20_000_000 });
    const metadata = await image.metadata();
    const expected = match[1] === 'jpeg' ? 'jpeg' : match[1];
    if (metadata.format !== expected) throw Error('Format mismatch');
    output = await image
      .rotate()
      .resize({ width: 2048, height: 2048, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 85 })
      .toBuffer();
  } catch {
    throw new HttpError(
      400,
      'This photo could not be decoded. Use a smaller JPG, PNG, WebP, or GIF.',
    );
  }
  if (output.length > 2 * 1024 * 1024) throw new HttpError(400, 'Use a smaller photo.');
  await mkdir(directory, { recursive: true });
  const filename = `${randomUUID()}.webp`;
  await writeFile(join(directory, filename), output, { flag: 'wx' });
  return { url: `/media/${filename}`, created: true };
}

export async function removeImage(url, directory) {
  if (!/^\/media\/[a-f\d-]{36}\.webp$/.test(url || '')) return true;
  try {
    await unlink(join(directory, url.slice('/media/'.length)));
    return true;
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('Media cleanup failed:', error.code);
    return error.code === 'ENOENT';
  }
}
