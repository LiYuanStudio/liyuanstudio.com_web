import { config } from 'dotenv';
import { join } from 'node:path';
import { connectDB } from '../src/lib/db.js';
import { BlogModel } from '../src/models/blog.js';
import { CounterModel } from '../src/models/counter.js';
import { UserModel, DEFAULT_AVATAR } from '../src/models/user.js';

config({ path: join(process.cwd(), 'server', '.env') });

import '../src/config/env.js';

const SEED_BLOG_SLUGS = [
  'workbench-design-philosophy',
  'cloud-hosting-guide',
  'living-tech',
];

const MOCK_AVATAR_VALUES = [
  'data:image/jpeg;base64,cropped',
  'avatar.png',
  'new.png',
];

async function cleanup() {
  await connectDB();

  const avatarReset = await UserModel.updateMany(
    { avatar: { $in: MOCK_AVATAR_VALUES } },
    { $set: { avatar: DEFAULT_AVATAR } },
  );
  console.log(`Reset ${avatarReset.modifiedCount} user avatar(s) with known test placeholders.`);

  const testUsers = await UserModel.find({ email: /@example\.com$/i }).select('_id email');
  const testUserIds = testUsers.map((user) => user._id);

  if (testUserIds.length > 0) {
    const deletedUsers = await UserModel.deleteMany({ _id: { $in: testUserIds } });
    console.log(`Deleted ${deletedUsers.deletedCount} @example.com test user(s).`);

    const deletedBlogs = await BlogModel.deleteMany({ authorId: { $in: testUserIds } });
    console.log(`Deleted ${deletedBlogs.deletedCount} blog post(s) authored by test users.`);
  } else {
    console.log('No @example.com test users found.');
  }

  const preservedSeedCount = await BlogModel.countDocuments({ slug: { $in: SEED_BLOG_SLUGS } });
  console.log(`Preserved ${preservedSeedCount} seeded blog post(s).`);

  const highest = await BlogModel.findOne({ blogNumber: { $exists: true } })
    .sort({ blogNumber: -1 })
    .select('blogNumber')
    .lean() as { blogNumber?: number } | null;

  const maxBlogNumber = typeof highest?.blogNumber === 'number' ? highest.blogNumber : 0;
  if (maxBlogNumber > 0) {
    await CounterModel.findOneAndUpdate(
      { _id: 'blogNumber' },
      { $max: { seq: maxBlogNumber } },
      { upsert: true },
    );
    console.log(`Synced blogNumber counter to at least ${maxBlogNumber}.`);
  } else {
    console.log('No blogNumber values found; counter left unchanged.');
  }

  process.exit(0);
}

cleanup().catch((error) => {
  console.error('Mock data cleanup failed:', error);
  process.exit(1);
});
