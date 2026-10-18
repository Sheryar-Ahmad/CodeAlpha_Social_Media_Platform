import { createHash } from 'node:crypto';
import { rateLimit } from 'express-rate-limit';
import { RateBucket } from './models.js';

// Serverless instances share atomic counters. Store a hash rather than the IP.
export class MongoRateStore {
  localKeys = false;
  constructor(prefix) {
    this.prefix = prefix;
  }
  init(options) {
    this.windowMs = options.windowMs;
  }
  id(key) {
    return createHash('sha256').update(`${this.prefix}:${key}`).digest('hex');
  }
  async increment(key) {
    const now = new Date();
    const currentWindow = { $gt: ['$expiresAt', now] };
    const update = [
      {
        $set: {
          hits: { $cond: [currentWindow, { $add: ['$hits', 1] }, 1] },
          expiresAt: { $cond: [currentWindow, '$expiresAt', new Date(Date.now() + this.windowMs)] },
        },
      },
    ];
    const query = { _id: this.id(key) };
    let bucket;
    try {
      bucket = await RateBucket.collection.findOneAndUpdate(query, update, {
        upsert: true,
        returnDocument: 'after',
      });
    } catch (error) {
      if (error.code !== 11000) throw error;
      bucket = await RateBucket.collection.findOneAndUpdate(query, update, {
        returnDocument: 'after',
      });
    }
    return { totalHits: bucket.hits, resetTime: bucket.expiresAt };
  }
  async decrement(key) {
    await RateBucket.updateOne({ _id: this.id(key), hits: { $gt: 0 } }, { $inc: { hits: -1 } });
  }
  async resetKey(key) {
    await RateBucket.deleteOne({ _id: this.id(key) });
  }
}

export function limitRequests(config, name, options) {
  return rateLimit({
    ...options,
    ...(config.serverless ? { store: new MongoRateStore(name) } : {}),
  });
}
