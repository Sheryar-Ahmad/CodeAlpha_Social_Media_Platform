import { z } from 'zod';
import { topics } from '../client/data/seed.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}
const text = (max) => z.string().trim().max(max);
const objectId = z.string().regex(/^[a-f\d]{24}$/i, 'Invalid resource ID.');
const topic = z.enum(topics.map((item) => item.name));
const password = z.string().min(12, 'Use at least 12 characters for your password.').max(128);
const email = z.string().trim().toLowerCase().email().max(254);
export const registerSchema = z
  .object({
    name: text(60).min(1),
    handle: z
      .string()
      .trim()
      .toLowerCase()
      .regex(
        /^[a-z][a-z0-9_]{2,24}$/,
        'Use 3–25 lowercase letters, numbers, or underscores; start with a letter.',
      ),
    email,
    password,
  })
  .strict();
export const loginSchema = z.object({ email, password: z.string().min(1).max(128) }).strict();
export const passwordChangeSchema = z
  .object({
    currentPassword: z.string().min(1).max(128),
    newPassword: password,
  })
  .strict()
  .refine((value) => value.currentPassword !== value.newPassword, 'Choose a different password.');
export const collectionNameSchema = z.object({ name: text(30).min(1) }).strict();
export const profileSchema = z.object({ name: text(60).min(1), bio: text(160) }).strict();
export const preferenceSchema = z
  .object({
    interests: z
      .array(topic)
      .max(6)
      .refine((values) => new Set(values).size === values.length)
      .optional(),
    theme: z.enum(['light', 'dark']).optional(),
  })
  .strict()
  .refine((value) => Object.keys(value).length > 0);
export const postSchema = z
  .object({
    title: text(80).default(''),
    text: text(500),
    topic,
    image: z.string().max(2_800_000).nullable(),
    imageAlt: text(160),
  })
  .strict()
  .superRefine((value, context) => {
    if (!value.text && !value.image)
      context.addIssue({
        code: 'custom',
        message: 'Write something or add a photo before publishing.',
      });
    if (value.image && !value.imageAlt)
      context.addIssue({
        code: 'custom',
        message: 'Describe your photo so everyone can enjoy it.',
      });
  });
export const editPostSchema = z
  .object({
    title: text(80),
    text: text(500),
    topic,
    image: z.string().max(2_800_000).nullable(),
    imageAlt: text(160),
    revision: z.number().int().nonnegative(),
  })
  .strict()
  .refine(
    (value) => (value.text || value.image) && (!value.image || value.imageAlt),
    'Write a post and describe any photo.',
  );
export const commentSchema = z
  .object({ text: text(300).min(1, 'Write a comment before sending.') })
  .strict();
export const collectionSchema = z.object({ id: z.string().uuid(), name: text(30).min(1) }).strict();
export const assignmentSchema = z.object({ collectionId: z.string().max(80).nullable() }).strict();
export const feedSchema = z
  .object({
    view: z.enum(['Home', 'Explore', 'Bookmarks', 'Profile', 'PublicProfile']).default('Home'),
    order: z.enum(['For you', 'Following', 'Latest', 'Popular']).default('For you'),
    topic: z.union([topic, z.literal('All')]).default('All'),
    q: text(100).default(''),
    collection: z.string().max(80).default('all'),
    author: objectId.optional(),
    cursor: z.string().max(1000).optional(),
    limit: z.coerce.number().int().min(1).max(48).default(24),
  })
  .strict();

export function parse(schema, input) {
  const result = schema.safeParse(input);
  if (!result.success)
    throw new HttpError(400, result.error.issues[0]?.message || 'Invalid input.');
  return result.data;
}
export function resourceId(value) {
  return parse(objectId, value);
}
export function literalSearch(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}
