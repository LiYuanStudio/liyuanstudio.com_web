import { config } from 'dotenv';
import { join } from 'node:path';
import { connectDB } from '../src/lib/db.js';
import { UserModel } from '../src/models/user.js';

// This script is run from the repo root; explicitly load server/.env so it
// works regardless of the current working directory.
config({ path: join(process.cwd(), 'server', '.env') });

import '../src/config/env.js';

async function cleanup() {
  await connectDB();

  const result = await UserModel.deleteMany({ emailVerified: false });
  console.log(`Deleted ${result.deletedCount} unverified user(s).`);
  process.exit(0);
}

cleanup().catch((err) => {
  console.error('Cleanup failed:', err);
  process.exit(1);
});
