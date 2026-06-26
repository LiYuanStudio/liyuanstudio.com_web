import mongoose from 'mongoose';
import { connectDB } from '../lib/db.js';
import { UserModel } from '../models/user.js';
import { env } from '../config/env.js';

async function main() {
  if (env.ADMIN_EMAILS.length === 0) {
    console.log('ADMIN_EMAILS is not set, nothing to do.');
    return;
  }

  await connectDB();

  const result = await UserModel.updateMany(
    { email: { $in: env.ADMIN_EMAILS }, role: { $ne: 'admin' } },
    { $set: { role: 'admin' } },
  );

  console.log(`Promoted ${result.modifiedCount} user(s) to admin.`);
  console.log(`Admin emails: ${env.ADMIN_EMAILS.join(', ')}`);

  await mongoose.disconnect();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
