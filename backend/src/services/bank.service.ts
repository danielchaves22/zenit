import { Bank, PrismaClient } from '@prisma/client';
import { BANK_CATALOG, getBankIconOptions, getBankIconPath } from '../catalogs/bank-catalog';

const prisma = new PrismaClient();

const AVAILABLE_ICON_SLUGS = new Set(BANK_CATALOG.map((item) => item.iconSlug));

function normalizeBankCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
}

function normalizeName(value: string) {
  return value.trim();
}

function serializeBank(bank: Bank & { _count?: { accounts: number } }) {
  return {
    ...bank,
    iconPath: getBankIconPath(bank.iconSlug),
    linkedAccountsCount: bank._count?.accounts
  };
}

export default class BankService {
  static listIconOptions() {
    return getBankIconOptions();
  }

  static async listAdminBanks() {
    const banks = await prisma.bank.findMany({
      include: {
        _count: {
          select: {
            accounts: true
          }
        }
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }]
    });

    return banks.map(serializeBank);
  }

  static async listActiveBanks() {
    const banks = await prisma.bank.findMany({
      where: {
        isActive: true
      },
      orderBy: [{ displayOrder: 'asc' }, { name: 'asc' }]
    });

    return banks.map(serializeBank);
  }

  static async getById(id: number) {
    const bank = await prisma.bank.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            accounts: true
          }
        }
      }
    });

    return bank ? serializeBank(bank) : null;
  }

  static async resolveLinkedBank(bankId?: number | null) {
    if (!bankId) {
      return {
        bankId: null,
        bankName: null,
        bankCode: null
      };
    }

    const bank = await prisma.bank.findUnique({
      where: { id: bankId }
    });

    if (!bank) {
      throw new Error('Banco selecionado nao encontrado');
    }

    return {
      bankId: bank.id,
      bankName: bank.name,
      bankCode: bank.code
    };
  }

  static async createBank(data: {
    code: string;
    name: string;
    iconSlug: string;
    displayOrder?: number;
    isActive?: boolean;
  }) {
    const code = normalizeBankCode(data.code);
    const name = normalizeName(data.name);

    if (!AVAILABLE_ICON_SLUGS.has(data.iconSlug)) {
      throw new Error('Icone de banco invalido');
    }

    const bank = await prisma.bank.create({
      data: {
        code,
        name,
        iconSlug: data.iconSlug,
        displayOrder: data.displayOrder ?? 0,
        isActive: data.isActive ?? true
      }
    });

    return serializeBank(bank);
  }

  static async updateBank(
    id: number,
    data: Partial<{
      code: string;
      name: string;
      iconSlug: string;
      displayOrder: number;
      isActive: boolean;
    }>
  ) {
    if (data.iconSlug && !AVAILABLE_ICON_SLUGS.has(data.iconSlug)) {
      throw new Error('Icone de banco invalido');
    }

    const bank = await prisma.bank.update({
      where: { id },
      data: {
        code: data.code ? normalizeBankCode(data.code) : undefined,
        name: data.name ? normalizeName(data.name) : undefined,
        iconSlug: data.iconSlug,
        displayOrder: data.displayOrder,
        isActive: data.isActive
      }
    });

    return serializeBank(bank);
  }

  static async deleteBank(id: number) {
    const linkedAccountsCount = await prisma.financialAccount.count({
      where: {
        bankId: id
      }
    });

    if (linkedAccountsCount > 0) {
      throw new Error(
        `Nao e possivel excluir o banco porque existem ${linkedAccountsCount} cartoes vinculados`
      );
    }

    await prisma.bank.delete({
      where: { id }
    });
  }
}
