/**
 * Sample news/blog seed content was removed so gray/production no longer
 * get placeholder "最新动态" cards. Prefer creating real content via the
 * admin console. For local empty-state checks, leave the DB unseeded.
 *
 * To remove rows already inserted by the old seed script, run:
 *   npm run cleanup-mock:api
 */
async function seed() {
  console.log('No sample news/blog seed data is configured. Skipping.');
  process.exit(0);
}

seed().catch((err) => {
  console.error('Seed failed:', err);
  process.exit(1);
});
