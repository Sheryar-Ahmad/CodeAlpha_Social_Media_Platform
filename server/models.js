import mongoose from 'mongoose';
import { randomUUID } from 'node:crypto';

const { Schema } = mongoose;
const objectId = Schema.Types.ObjectId;
const collectionSchema = new Schema({ id: String, name: String, key: String }, { _id: false });
const bookmarkSchema = new Schema(
  { postId: objectId, collectionId: { type: String, default: null }, savedAt: Date },
  { _id: false },
);
const notificationSchema = new Schema(
  {
    id: { type: String, default: randomUUID },
    actorId: objectId,
    kind: { type: String, enum: ['like', 'comment', 'follow'] },
    postId: { type: objectId, default: null },
    detail: String,
    createdAt: { type: Date, default: Date.now },
    readAt: { type: Date, default: null },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, maxlength: 60 },
    handle: { type: String, required: true, unique: true },
    email: { type: String, required: true, unique: true, select: false },
    passwordHash: { type: String, select: false },
    sessionVersion: { type: Number, default: 0 },
    bio: { type: String, default: '', maxlength: 160 },
    photo: { type: String, default: null },
    isSample: { type: Boolean, default: false },
    interests: { type: [String], default: ['Design', 'Technology'] },
    theme: { type: String, enum: ['light', 'dark'], default: 'light' },
    following: { type: [objectId], default: [] },
    saved: { type: [bookmarkSchema], default: [] },
    collections: {
      type: [collectionSchema],
      default: () => [
        { id: 'ideas', name: 'Ideas', key: 'ideas' },
        { id: 'resources', name: 'Resources', key: 'resources' },
        { id: 'to-try', name: 'To try', key: 'to try' },
      ],
    },
    notifications: { type: [notificationSchema], default: [] },
  },
  { timestamps: true, bufferCommands: false },
);
userSchema.index({ createdAt: -1, _id: -1 });
userSchema.index({ following: 1 });

const commentSchema = new Schema({
  authorId: { type: objectId, required: true },
  text: { type: String, required: true, maxlength: 300 },
  createdAt: { type: Date, default: Date.now },
});
const postSchema = new Schema(
  {
    authorId: { type: objectId, required: true },
    title: { type: String, default: '', maxlength: 80 },
    text: { type: String, default: '', maxlength: 500 },
    topic: { type: String, required: true },
    image: { type: String, default: null },
    imageAlt: { type: String, default: '', maxlength: 160 },
    likedBy: { type: [objectId], default: [] },
    comments: { type: [commentSchema], default: [] },
    revision: { type: Number, default: 0 },
    deletedAt: { type: Date, default: null },
    isSample: { type: Boolean, default: false },
    seedKey: { type: String, unique: true, sparse: true },
  },
  { timestamps: true, bufferCommands: false },
);
postSchema.index({ deletedAt: 1, createdAt: -1, _id: -1 });
postSchema.index({ authorId: 1, deletedAt: 1, createdAt: -1, _id: -1 });
postSchema.index({ topic: 1, deletedAt: 1, createdAt: -1, _id: -1 });
postSchema.index({ likedBy: 1 });

const sessionSchema = new Schema(
  {
    tokenHash: { type: String, required: true, unique: true },
    userId: { type: objectId, required: true },
    version: { type: Number, default: 0 },
    device: { type: String, default: 'Browser', maxlength: 80 },
    expiresAt: { type: Date, required: true },
  },
  { timestamps: true, bufferCommands: false },
);
sessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
sessionSchema.index({ userId: 1 });

export const User = mongoose.model('User', userSchema);
export const Post = mongoose.model('Post', postSchema);
export const Session = mongoose.model('Session', sessionSchema);

export async function connectDatabase(uri) {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    // Acknowledged changes must survive an abrupt local process shutdown.
    writeConcern: { w: 'majority', journal: true },
  });
  await Promise.all([User.init(), Post.init(), Session.init()]);
}
