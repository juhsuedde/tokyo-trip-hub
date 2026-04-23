// prisma/migrations/migrate_sessions_to_users.js
// Run once after deploying the Phase 4 schema migration:
//   node prisma/migrations/migrate_sessions_to_users.js

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcrypt';
import crypto from 'crypto';

const prisma = new PrismaClient();

async function main() {
  console.log('🚀 Starting session → user migration…');

  // Find all trips that currently have no memberships
  // (pre-Phase 4 trips were device-session based with no userId)
  const orphanTrips = await prisma.trip.findMany({
    where: { memberships: { none: {} } },
    include: { entries: { select: { userId: true }, distinct: ['userId'] } },
  });

  console.log(`Found ${orphanTrips.length} orphan trips to migrate`);

  for (const trip of orphanTrips) {
    // Create a placeholder "migrated" user to own the trip
    const placeholderEmail = `migrated-${trip.id}@placeholder.tokyotriphub.local`;
    const tempPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(tempPassword, 12);

    const user = await prisma.user.upsert({
      where: { email: placeholderEmail },
      update: {},
      create: {
        email: placeholderEmail,
        passwordHash,
        name: `Migrated User (${trip.name})`,
        preferences: { migrated: true, originalTripId: trip.id },
        subscription: {
          create: { tier: 'FREE', status: 'ACTIVE' },
        },
      },
    });

    // Create OWNER membership
    await prisma.tripMembership.upsert({
      where: { userId_tripId: { userId: user.id, tripId: trip.id } },
      update: {},
      create: { userId: user.id, tripId: trip.id, role: 'OWNER' },
    });

    console.log(`  ✅ Trip "${trip.name}" → placeholder user ${user.id}`);
  }

  // Update entries that have no userId to point to their trip's owner
  const entriesWithoutUser = await prisma.entry.findMany({
    where: { userId: null },
    include: { trip: { include: { memberships: { where: { role: 'OWNER' }, take: 1 } } } },
  });

  let updatedEntries = 0;
  for (const entry of entriesWithoutUser) {
    const owner = entry.trip.memberships[0];
    if (owner) {
      await prisma.entry.update({
        where: { id: entry.id },
        data: { userId: owner.userId },
      });
      updatedEntries++;
    }
  }

  console.log(`  ✅ Updated ${updatedEntries} anonymous entries with owner userId`);
  console.log('✨ Migration complete. Placeholder accounts use random passwords and cannot log in.');
  console.log('   Real users must register with their email to claim/create trips.');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
