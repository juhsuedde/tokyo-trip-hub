import 'dotenv/config';
import bcrypt from 'bcrypt';
import { prisma } from './prisma';
import type { Category, Sentiment, EntryType } from '../types';

const USERS = [
  { name: 'Alex', tempSession: 'demo-session-alex', email: 'alex@demo.com', passwordHash: 'demo123' },
  { name: 'Yuki', tempSession: 'demo-session-yuki', email: 'yuki@demo.com', passwordHash: 'demo123' },
  { name: 'Kai', tempSession: 'demo-session-kai', email: 'kai@demo.com', passwordHash: 'demo123' },
  { name: 'Sara', tempSession: 'demo-session-sara', email: 'sara@demo.com', passwordHash: 'demo123' },
];

const ENTRIES: Array<{
  authorIndex: number;
  type: EntryType;
  rawText: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  category: Category;
  sentiment: Sentiment;
  tags: string[];
}> = [
  {
    authorIndex: 1,
    type: 'TEXT',
    rawText: 'Tsuta ramen — Michelin star shoyu broth. Queue was 45 mins but absolutely worth it 🤌',
    address: 'Tsuta Ramen, Sugamo, Tokyo',
    latitude: 35.7324,
    longitude: 139.7394,
    category: 'FOOD_DRINK',
    sentiment: 'POSITIVE',
    tags: ['ramen', 'michelin', 'sugamo', 'must-try'],
  },
  {
    authorIndex: 0,
    type: 'TEXT',
    rawText: 'IC Card works everywhere — get one at Narita. Avoid buying single tickets, it\'s a nightmare at rush hour.',
    address: 'Narita Airport, Terminal 2',
    category: 'TIP_WARNING',
    sentiment: 'POSITIVE',
    tags: ['ic-card', 'suica', 'transport', 'tip'],
  },
  {
    authorIndex: 3,
    type: 'TEXT',
    rawText: 'Meiji Jingu at sunrise. Completely empty. The gravel path through the cedar forest is magical.',
    address: 'Meiji Jingu, Harajuku, Tokyo',
    latitude: 35.6763,
    longitude: 139.6993,
    category: 'SIGHTSEEING',
    sentiment: 'POSITIVE',
    tags: ['meiji', 'shrine', 'harajuku', 'early-morning'],
  },
  {
    authorIndex: 2,
    type: 'TEXT',
    rawText: 'Don Quijote Shibuya has 5 floors of everything. Tax-free for passport holders. Got matcha kit-kats!',
    address: 'Don Quijote, Shibuya, Tokyo',
    latitude: 35.6598,
    longitude: 139.7004,
    category: 'SHOPPING',
    sentiment: 'POSITIVE',
    tags: ['donki', 'tax-free', 'matcha', 'shibuya'],
  },
  {
    authorIndex: 0,
    type: 'TEXT',
    rawText: 'Avoid Shibuya crossing on weekends after 8pm — absolute sardine tin. Go early morning for the iconic empty shot.',
    address: 'Shibuya Crossing, Tokyo',
    latitude: 35.6595,
    longitude: 139.7004,
    category: 'TIP_WARNING',
    sentiment: 'NEUTRAL',
    tags: ['shibuya', 'crowds', 'photography', 'warning'],
  },
];

async function seed() {
  console.log('🌱 Seeding database...');

  const users = [];
  for (const u of USERS) {
    const passwordHash = await bcrypt.hash(u.passwordHash, 12);
    const user = await prisma.user.upsert({
      where: { tempSession: u.tempSession },
      update: { name: u.name, email: u.email, passwordHash },
      create: { name: u.name, tempSession: u.tempSession, email: u.email, passwordHash },
    });
    users.push(user);
    console.log(`  ✓ User: ${user.name} (session: ${user.tempSession})`);
  }

  let trip = await prisma.trip.findFirst({
    where: { inviteCode: 'TOKYO1' },
  });

  if (!trip) {
    trip = await prisma.trip.create({
      data: {
        title: 'Tokyo Spring 2026',
        destination: 'Tokyo, Japan',
        startDate: new Date('2026-04-20'),
        endDate: new Date('2026-04-28'),
        inviteCode: 'TOKYO1',
        ownerId: users[0].id,
      },
    });
    console.log(`  ✓ Trip created: ${trip.title} (code: ${trip.inviteCode})`);
  } else {
    console.log(`  ↩ Trip already exists: ${trip.title}`);
  }

  for (let i = 0; i < users.length; i++) {
    await prisma.tripMembership.upsert({
      where: { userId_tripId: { userId: users[i].id, tripId: trip.id } },
      update: {},
      create: {
        userId: users[i].id,
        tripId: trip.id,
        role: i === 0 ? 'OWNER' : 'MEMBER',
      },
    });
  }
  console.log(`  ✓ Added ${users.length} members to trip`);

  let entryCount = 0;
  for (const e of ENTRIES) {
    const existing = await prisma.entry.findFirst({
      where: { tripId: trip.id, rawText: e.rawText },
    });
    if (existing) continue;

    const { authorIndex, ...entryData } = e;
    await prisma.entry.create({
      data: {
        ...entryData,
        tripId: trip.id,
        userId: users[authorIndex].id,
      },
    });
    entryCount++;
  }
  console.log(`  ✓ Created ${entryCount} entries`);

  console.log('\n✅ Seed complete!');
  console.log('\n📋 Test session tokens:');
  users.forEach(u => console.log(`  ${u.name}: ${u.tempSession}`));
  console.log(`\n🔗 Trip invite code: TOKYO1`);
  console.log(`   Trip ID: ${trip.id}`);
}

seed()
  .catch(err => {
    console.error('Seed failed:', err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
