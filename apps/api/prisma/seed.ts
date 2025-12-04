import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import { Pool } from 'pg';

// 1. 初始化 Adapter
const connectionString = `${process.env.DATABASE_URL}`;
const pool = new Pool({ connectionString });
const adapter = new PrismaPg(pool);

// 2. 注入 Adapter
const prisma = new PrismaClient({ adapter });

async function main() {
  console.log('🌱 Starting seed...');

  // 1. 清理舊資料
  await prisma.ticket.deleteMany();
  await prisma.ticketPool.deleteMany();
  await prisma.labelDesign.deleteMany();
  await prisma.user.deleteMany();

  // 2. 建立測試用戶
  const user = await prisma.user.create({
    data: {
      email: 'test@neonhops.com',
      name: 'Test User',
    },
  });
  console.log(`👤 Created User ID: ${user.id}`);

  // 3. 建立測試酒標
  const design = await prisma.labelDesign.create({
    data: {
      userId: user.id,
      imageUrl: 'https://placehold.co/600x400',
    },
  });
  console.log(`🎨 Created Design ID: ${design.id}`);

  // 4. 建立票池
  const pool = await prisma.ticketPool.create({
    data: {
      name: 'Early Bird',
      totalCount: 10,
      remainingCount: 10,
      startAt: new Date(),
      endAt: new Date(Date.now() + 1000 * 60 * 60 * 24),
    },
  });
  console.log(`🎫 Created Pool ID: ${pool.id}`);

  console.log('✅ Seed finished.');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
