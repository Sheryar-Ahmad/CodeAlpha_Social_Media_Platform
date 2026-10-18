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
    emailVerifiedAt: { type: Date, default: null },
    verificationToken: { type: String, select: false },
    verificationExpiresAt: Date,
    resetToken: { type: String, select: false },
    resetExpiresAt: Date,
    status: {
      type: String,
      enum: ['active', 'suspended', 'deleting', 'deleted'],
      default: 'active',
    },
    role: { type: String, enum: ['member', 'moderator'], default: 'member' },
    blocked: { type: [objectId], default: [] },
    deletionRequestedAt: Date,
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
userSchema.index({ blocked: 1 });

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
const mailJobSchema = new Schema(
  {
    userId: { type: objectId, required: true },
    kind: { type: String, enum: ['verification', 'recovery'], required: true },
    state: { type: String, enum: ['queued', 'sending', 'sent', 'failed'], default: 'queued' },
    attempts: { type: Number, default: 0 },
    requestVersion: { type: Number, default: 0 },
    requestedAt: { type: Date, default: Date.now },
    runAt: { type: Date, default: Date.now },
    lockedUntil: Date,
  },
  { timestamps: true, bufferCommands: false },
);
mailJobSchema.index({ userId: 1, kind: 1 }, { unique: true });
mailJobSchema.index({ state: 1, runAt: 1 });
mailJobSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 7 * 24 * 60 * 60 });
export const MailJob = mongoose.model('MailJob', mailJobSchema);
const reportSchema = new Schema(
  {
    reporterId: { type: objectId, required: true },
    kind: { type: String, enum: ['post', 'member'], required: true },
    targetId: { type: objectId, required: true },
    reason: { type: String, required: true },
    details: { type: String, maxlength: 500, default: '' },
    state: { type: String, enum: ['open', 'reviewing', 'resolved', 'dismissed'], default: 'open' },
    reviewerId: objectId,
    reviewLease: Date,
    reviewedAt: Date,
    resolution: String,
    notes: { type: String, maxlength: 500, default: '' },
  },
  { timestamps: true, bufferCommands: false },
);
reportSchema.index({ reporterId: 1, kind: 1, targetId: 1 }, { unique: true });
reportSchema.index({ state: 1, createdAt: 1 });
reportSchema.index({ reviewedAt: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });
export const Report = mongoose.model('Report', reportSchema);
const mediaDeletionSchema = new Schema(
  { url: { type: String, unique: true, required: true } },
  { timestamps: true, bufferCommands: false },
);
export const MediaDeletion = mongoose.model('MediaDeletion', mediaDeletionSchema);

export async function connectDatabase(uri) {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 5000,
    // Acknowledged changes must survive an abrupt local process shutdown.
    writeConcern: { w: 'majority', journal: true },
  });
  await Promise.all([
    User.init(),
    Post.init(),
    Session.init(),
    MailJob.init(),
    Report.init(),
    MediaDeletion.init(),
  ]);
  await User.updateMany({ status: { $exists: false } }, { $set: { status: 'active' } });
  await User.updateMany({ role: { $exists: false } }, { $set: { role: 'member' } });
}
