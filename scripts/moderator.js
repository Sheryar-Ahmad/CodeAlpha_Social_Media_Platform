import 'dotenv/config';
import mongoose from 'mongoose';
import { connectDatabase, User } from '../server/models.js';

const [action, handle] = process.argv.slice(2);
try {
  if (
    !['grant', 'revoke', 'restore'].includes(action) ||
    !/^[a-z][a-z0-9_]{2,24}$/.test(handle || '')
  )
    throw Error('Usage: node scripts/moderator.js grant|revoke|restore handle');
  await connectDatabase(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27018/forma');
  const query = { handle, isSample: false, status: action === 'restore' ? 'suspended' : 'active' };
  if (action === 'grant') query.emailVerifiedAt = { $ne: null };
  const change =
    action === 'restore'
      ? { status: 'active' }
      : { role: action === 'grant' ? 'moderator' : 'member' };
  const result = await User.updateOne(query, { $set: change }, { runValidators: true });
  if (!result.matchedCount)
    throw Error('No eligible account found. Moderator grants require a verified email.');
  console.log(`Account updated: @${handle} (${action}).`);
} catch (error) {
  console.error(
    error.name === 'Error'
      ? error.message
      : 'Account update failed. Check the database connection.',
  );
  process.exitCode = 1;
} finally {
  await mongoose.disconnect();
}
