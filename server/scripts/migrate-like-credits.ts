/**
 * One-time backfill: replay grant/spin/ledger history into LikeCredit rows.
 * Run from server/: npm run migrate:like-credits
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma.js";
import { replayLikeCreditsForUser } from "../src/services/like-tracking.js";

const MIGRATION_TIMEZONE = "UTC";

async function main() {
  if (!process.env.DATABASE_URL) {
    console.error("DATABASE_URL not set");
    process.exit(1);
  }

  const users = await prisma.user.findMany({ select: { id: true } });
  let migrated = 0;
  let failed = 0;

  for (const user of users) {
    const before = await prisma.likeCredit.count({ where: { userId: user.id } });
    if (before > 0) continue;

    try {
      await replayLikeCreditsForUser(user.id, MIGRATION_TIMEZONE);
      const after = await prisma.likeCredit.count({ where: { userId: user.id } });
      if (after > 0) migrated += 1;
    } catch (err) {
      failed += 1;
      console.error(`Failed to migrate user ${user.id}:`, err);
    }
  }

  console.log(`Migrated like credits for ${migrated} user(s).`);
  if (failed > 0) {
    console.error(`${failed} user(s) failed migration.`);
    process.exit(1);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
