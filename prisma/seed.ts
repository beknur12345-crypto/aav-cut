// Seeds the shared catalog of goods with generic board materials (no supplier branding).
import 'dotenv/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../src/generated/prisma/client';

const prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: process.env.DATABASE_URL!.replace(/([?&]sslmode=)(prefer|require|verify-ca)\b/, '$1verify-full') }) });

const boards: [string, string, string, number, number, number][] = [
  // category, code, name, thickness, length, width
  ['Melamine board (LDSP)', 'MEL-W-16', 'White melamine 16 mm', 16, 2750, 1830],
  ['Melamine board (LDSP)', 'MEL-W-18', 'White melamine 18 mm', 18, 2750, 1830],
  ['Melamine board (LDSP)', 'MEL-G-18', 'Light grey melamine 18 mm', 18, 2750, 1830],
  ['Melamine board (LDSP)', 'MEL-A-18', 'Anthracite melamine 18 mm', 18, 2750, 1830],
  ['Melamine board (LDSP)', 'MEL-OAK-18', 'Natural oak decor 18 mm', 18, 2800, 2070],
  ['Melamine board (LDSP)', 'MEL-WAL-18', 'Walnut decor 18 mm', 18, 2800, 2070],
  ['Melamine board (LDSP)', 'MEL-W-25', 'White melamine 25 mm', 25, 2750, 1830],
  ['MDF', 'MDF-16', 'MDF raw 16 mm', 16, 2800, 2070],
  ['MDF', 'MDF-19', 'MDF raw 19 mm', 19, 2800, 2070],
  ['MDF', 'MDF-W-18', 'MDF white primed 18 mm', 18, 2800, 2070],
  ['HDF / Fibreboard', 'HDF-W-3', 'HDF white 3 mm', 3.2, 2800, 2070],
  ['HDF / Fibreboard', 'HDF-W-4', 'HDF white 4 mm', 4, 2800, 2070],
  ['Plywood', 'PLY-BB-18', 'Birch plywood BB/BB 18 mm', 18, 1525, 1525],
  ['Plywood', 'PLY-BB-12', 'Birch plywood BB/BB 12 mm', 12, 1525, 1525],
  ['Worktops', 'WT-38', 'Worktop 38 mm', 38, 4100, 600],
];

async function main() {
  const existing = await prisma.material.count({ where: { userId: null } });
  if (existing > 0) {
    console.log(`Catalog already seeded (${existing} materials).`);
    return;
  }
  await prisma.material.createMany({
    data: boards.map(([category, code, name, thickness, length, width]) => ({ category, code, name, thickness, length, width, unit: 'm2' })),
  });
  console.log(`Seeded ${boards.length} catalog materials.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
