import { createRequire } from 'node:module';
import { experiences } from '../src/lib/catalog';
import { documentDatabase } from '../src/lib/backend/database';
import { packageDataSchema } from '../src/lib/backend/packages';

const require = createRequire(import.meta.url);
const { loadEnvConfig } = createRequire(require.resolve('next/package.json'))('@next/env');
loadEnvConfig(process.cwd());

function durationMinutes(duration: string) {
  const match = /^(\d+(?:\.\d+)?)\s*(minutes?|mins?|hours?|hrs?)$/i.exec(duration.trim());
  if (!match) throw new Error(`Unsupported package duration: ${duration}`);
  const value = Number(match[1]);
  return Math.max(1, Math.round(/^(minutes?|mins?)$/i.test(match[2]) ? value : value * 60));
}

async function main() {
  const db = documentDatabase();
  try {
    await Promise.all(experiences.map(async (input, sortOrder) => {
      const item = packageDataSchema.parse(input);
      await db.experiencePackage.upsert({
        where: { id: item.id },
        create: {
          id: item.id, title: item.title, destination: item.destination, country: item.country,
          category: item.category, price: item.price, rating: item.rating,
          sortOrder,
          durationMinutes: durationMinutes(item.duration), duration: item.duration,
          freeCancellation: item.freeCancellation, published: true,
          data: JSON.parse(JSON.stringify(item)),
        },
        update: {
          title: item.title, destination: item.destination, country: item.country,
          category: item.category, price: item.price, rating: item.rating,
          sortOrder,
          durationMinutes: durationMinutes(item.duration), duration: item.duration,
          freeCancellation: item.freeCancellation, published: true,
          data: JSON.parse(JSON.stringify(item)),
        },
      });
    }));
    console.log(`Seeded ${experiences.length} sample packages.`);
  } finally {
    await db.$disconnect();
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Package catalog seed failed.');
  process.exitCode = 1;
});
