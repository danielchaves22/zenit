import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

export async function getUserPreference(userId: number) {
  return prisma.userPreference.findUnique({ where: { userId } });
}

export async function setColorScheme(userId: number, colorScheme: string) {
  return updateUserPreferences(userId, { colorScheme });
}

export async function updateUserPreferences(
  userId: number,
  data: {
    colorScheme?: string | null;
    confirmNegativeBalanceMovements?: boolean;
  }
) {
  const updateData: Prisma.UserPreferenceUpdateInput = {};

  if (data.colorScheme !== undefined) {
    updateData.colorScheme = data.colorScheme;
  }

  if (data.confirmNegativeBalanceMovements !== undefined) {
    updateData.confirmNegativeBalanceMovements = data.confirmNegativeBalanceMovements;
  }

  return prisma.userPreference.upsert({
    where: { userId },
    update: updateData,
    create: {
      userId,
      colorScheme: data.colorScheme ?? null,
      confirmNegativeBalanceMovements: data.confirmNegativeBalanceMovements ?? true
    }
  });
}
