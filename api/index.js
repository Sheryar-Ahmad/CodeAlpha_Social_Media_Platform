import { waitUntil } from '@vercel/functions';
import { configuration } from '../server/config.js';
import { serverlessHandler } from '../server/serverless.js';

let handler;
export default async function api(request, response) {
  try {
    if (!handler) {
      const config = configuration(process.env);
      if (
        !process.env.MONGODB_URI ||
        config.mediaStore !== 'cloudinary' ||
        config.mailMode !== 'brevo' ||
        config.cronSecret.length < 32
      )
        throw Error('Configure Atlas, Cloudinary, Brevo, and CRON_SECRET for Vercel.');
      handler = serverlessHandler(config, { uri: process.env.MONGODB_URI, waitUntil });
    }
    return await handler(request, response);
  } catch (error) {
    console.error('Serverless configuration unavailable:', error.name);
    response.setHeader('Cache-Control', 'no-store');
    return response
      .status(503)
      .json({ error: 'Forma is temporarily unavailable. Please try again.' });
  }
}
