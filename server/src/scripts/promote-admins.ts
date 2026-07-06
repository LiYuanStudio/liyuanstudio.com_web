import mongoose from 'mongoose';
import { pathToFileURL } from 'node:url';
import { connectDB } from '../lib/db.js';
import { UserModel } from '../models/user.js';
import { env } from '../config/env.js';
import { ensureUsername, isValidUsername } from '../lib/usernames.js';

export async function promoteAdmins() {
  if (env.ADMIN_EMAILS.length === 0) {
    console.log('ADMIN_EMAILS is not set, nothing to do.');
    return;
  }

  await connectDB();

  const roleResult = await UserModel.updateMany(
    { email: { $in: env.ADMIN_EMAILS }, role: { $ne: 'admin' } },
    { $set: { role: 'admin' } },
  );

  const adminUsers = await UserModel.find({ email: { $in: env.ADMIN_EMAILS } });
  let usernameRepairCount = 0;

  for (const user of adminUsers) {
    if (!isValidUsername(user.username)) {
      await ensureUsername(user, 'promote-admins');
      if (isValidUsername(user.username)) {
        usernameRepairCount += 1;
      }
    }
  }

  console.log(`Promoted ${roleResult.modifiedCount} user(s) to admin.`);
  console.log(`Repaired ${usernameRepairCount} admin username(s).`);
  console.log(`Checked ${adminUsers.length} admin account(s).`);

  await mongoose.disconnect();
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  promoteAdmins().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
