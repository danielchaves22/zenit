import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

export async function getUserPreference(userId: number) {
  return prisma.userPreference.findUnique({ where: { userId } });
}

export async function setColorScheme(userId: number, colorScheme: string) {
  return prisma.userPreference.upsert({
    where: { userId },
    update: { colorScheme },
    create: { userId, colorScheme }
  });
}
