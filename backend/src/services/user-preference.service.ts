import prisma from '../lib/prisma';


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
