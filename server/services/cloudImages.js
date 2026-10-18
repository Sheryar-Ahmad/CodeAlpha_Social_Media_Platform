import { createHash, randomUUID } from 'node:crypto';

// Only this application's UUID-named assets can enter the deletion queue.
const cloudImage =
  /^https:\/\/res\.cloudinary\.com\/([a-zA-Z0-9_-]+)\/image\/upload\/v1\/forma\/([a-f\d-]{36})\.webp$/;
export const isCloudImage = (url) => cloudImage.test(url || '');

function cloudRequest(config, action, values) {
  const { cloudName, apiKey, apiSecret } = config.cloudinary;
  const fields = { ...values, timestamp: String(Math.floor(Date.now() / 1000)) };
  const signed = Object.keys(fields)
    .sort()
    .map((key) => `${key}=${fields[key]}`)
    .join('&');
  const signature = createHash('sha256')
    .update(signed + apiSecret)
    .digest('hex');
  const body = new FormData();
  for (const [key, value] of Object.entries(fields)) body.set(key, value);
  body.set('api_key', apiKey);
  body.set('signature', signature);
  return { body, endpoint: `https://api.cloudinary.com/v1_1/${cloudName}/image/${action}` };
}

export async function uploadCloudImage(bytes, config, fetcher = fetch) {
  const id = randomUUID();
  const { body, endpoint } = cloudRequest(config, 'upload', {
    public_id: `forma/${id}`,
    overwrite: 'false',
  });
  // File bytes are deliberately excluded from the signed parameter string.
  body.set('file', new Blob([bytes], { type: 'image/webp' }), `${id}.webp`);
  const response = await fetcher(endpoint, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) throw Error('Cloud image upload unavailable.');
  const result = await response.json();
  if (result.public_id !== `forma/${id}` || result.format !== 'webp')
    throw Error('Unexpected cloud image response.');
  // v1 also supports invalidation of folder public IDs on legacy CDN configurations.
  return `https://res.cloudinary.com/${config.cloudinary.cloudName}/image/upload/v1/forma/${id}.webp`;
}

export async function removeCloudImage(url, config, fetcher = fetch) {
  const match = cloudImage.exec(url || '');
  if (!match || match[1] !== config.cloudinary.cloudName) return false;
  const { body, endpoint } = cloudRequest(config, 'destroy', {
    public_id: `forma/${match[2]}`,
    invalidate: 'true',
  });
  const response = await fetcher(endpoint, {
    method: 'POST',
    body,
    signal: AbortSignal.timeout(12_000),
  });
  if (!response.ok) return false;
  const result = await response.json();
  return ['ok', 'not found'].includes(result.result);
}
