import { AppKey, PrismaClient } from '@prisma/client'
import { APP_HEADER_BY_KEY } from '../constants/app-access'

const prisma = new PrismaClient()

export interface AppAccessView {
  appKey: string
  enabled: boolean
  granted: boolean
  allowed: boolean
}

export default class AppAccessService {
  static async ensureCatalog(): Promise<void> {
    const catalog = [
      { appKey: AppKey.ZENIT_CASH, name: 'Zenit Cash' },
      { appKey: AppKey.ZENIT_CALC, name: 'Zenit Calc' },
      { appKey: AppKey.ZENIT_ADMIN, name: 'Zenit Admin' }
    ]

    for (const item of catalog) {
      await prisma.ecosystemApp.upsert({
        where: { appKey: item.appKey },
        update: { name: item.name, isActive: true },
        create: { appKey: item.appKey, name: item.name, isActive: true }
      })
    }
  }

  static async listCatalog() {
    await this.ensureCatalog()
    const apps = await prisma.ecosystemApp.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' }
    })

    return apps.map(app => ({
      appKey: APP_HEADER_BY_KEY[app.appKey],
      name: app.name,
      enabled: app.isActive
    }))
  }

  static async getCompanyEntitlements(companyId: number) {
    await this.ensureCatalog()
    const [apps, entitlements] = await Promise.all([
      prisma.ecosystemApp.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' }
      }),
      prisma.companyAppEntitlement.findMany({
        where: { companyId },
        include: { app: true }
      })
    ])

    return apps.map(app => {
      const found = entitlements.find(entry => entry.appId === app.id)
      return {
        appKey: APP_HEADER_BY_KEY[app.appKey],
        enabled: found ? found.enabled : false
      }
    })
  }

  static async setCompanyEntitlements(companyId: number, payload: Array<{ appKey: AppKey; enabled: boolean }>) {
    await this.ensureCatalog()
    const apps = await prisma.ecosystemApp.findMany({
      where: { appKey: { in: payload.map(item => item.appKey) } }
    })

    await prisma.$transaction(
      payload.map(item => {
        const app = apps.find(candidate => candidate.appKey === item.appKey)
        if (!app) {
          throw new Error(`Aplicacao ${item.appKey} nao encontrada`)
        }
        return prisma.companyAppEntitlement.upsert({
          where: { unique_company_app_entitlement: { companyId, appId: app.id } },
          update: { enabled: item.enabled },
          create: { companyId, appId: app.id, enabled: item.enabled }
        })
      })
    )
  }

  static async getUserGrants(userId: number, companyId: number) {
    await this.ensureCatalog()
    const [apps, grants] = await Promise.all([
      prisma.ecosystemApp.findMany({
        where: { isActive: true },
        orderBy: { id: 'asc' }
      }),
      prisma.userAppGrant.findMany({
        where: { userId, companyId },
        include: { app: true }
      })
    ])

    return apps.map(app => {
      const found = grants.find(entry => entry.appId === app.id)
      return {
        appKey: APP_HEADER_BY_KEY[app.appKey],
        granted: found ? found.granted : false
      }
    })
  }

  static async setUserGrants(userId: number, companyId: number, payload: Array<{ appKey: AppKey; granted: boolean }>) {
    await this.ensureCatalog()
    const apps = await prisma.ecosystemApp.findMany({
      where: { appKey: { in: payload.map(item => item.appKey) } }
    })

    await prisma.$transaction(
      payload.map(item => {
        const app = apps.find(candidate => candidate.appKey === item.appKey)
        if (!app) {
          throw new Error(`Aplicacao ${item.appKey} nao encontrada`)
        }
        return prisma.userAppGrant.upsert({
          where: {
            unique_user_company_app_grant: {
              userId,
              companyId,
              appId: app.id
            }
          },
          update: { granted: item.granted },
          create: { userId, companyId, appId: app.id, granted: item.granted }
        })
      })
    )
  }

  static async setUserGrantsForManyCompanies(
    userId: number,
    payload: Array<{ companyId: number; appKey: AppKey; granted: boolean }>
  ) {
    await this.ensureCatalog()
    const appMap = new Map(
      (
        await prisma.ecosystemApp.findMany({
          where: {
            appKey: { in: payload.map(item => item.appKey) }
          }
        })
      ).map(app => [app.appKey, app.id] as const)
    )

    await prisma.$transaction(
      payload.map(item => {
        const appId = appMap.get(item.appKey)
        if (!appId) {
          throw new Error(`Aplicacao ${item.appKey} nao encontrada`)
        }
        return prisma.userAppGrant.upsert({
          where: {
            unique_user_company_app_grant: {
              userId,
              companyId: item.companyId,
              appId
            }
          },
          update: { granted: item.granted },
          create: {
            userId,
            companyId: item.companyId,
            appId,
            granted: item.granted
          }
        })
      })
    )
  }

  static async buildDefaultGrantsForCompanies(
    companyIds: number[]
  ): Promise<Array<{ companyId: number; appKey: AppKey; granted: boolean }>> {
    await this.ensureCatalog()
    if (companyIds.length === 0) return []

    const entitlements = await prisma.companyAppEntitlement.findMany({
      where: {
        companyId: { in: companyIds },
        enabled: true
      },
      include: { app: true }
    })

    return entitlements.map(entitlement => ({
      companyId: entitlement.companyId,
      appKey: entitlement.app.appKey,
      granted: true
    }))
  }

  static async getEffectiveAccess(userId: number, companyId: number): Promise<AppAccessView[]> {
    await this.ensureCatalog()

    const apps = await prisma.ecosystemApp.findMany({
      where: { isActive: true },
      orderBy: { id: 'asc' }
    })

    const [entitlements, grants] = await Promise.all([
      prisma.companyAppEntitlement.findMany({
        where: { companyId, appId: { in: apps.map(app => app.id) } }
      }),
      prisma.userAppGrant.findMany({
        where: { userId, companyId, appId: { in: apps.map(app => app.id) } }
      })
    ])

    return apps.map(app => {
      const entitlement = entitlements.find(entry => entry.appId === app.id)
      const grant = grants.find(entry => entry.appId === app.id)
      const enabled = Boolean(entitlement?.enabled)
      const granted = Boolean(grant?.granted)
      return {
        appKey: APP_HEADER_BY_KEY[app.appKey],
        enabled,
        granted,
        allowed: enabled && granted
      }
    })
  }

  static async hasEffectiveAccess(userId: number, companyId: number, appKey: AppKey): Promise<boolean> {
    await this.ensureCatalog()
    const app = await prisma.ecosystemApp.findUnique({ where: { appKey } })
    if (!app || !app.isActive) return false

    const [entitlement, grant] = await Promise.all([
      prisma.companyAppEntitlement.findUnique({
        where: {
          unique_company_app_entitlement: {
            companyId,
            appId: app.id
          }
        }
      }),
      prisma.userAppGrant.findUnique({
        where: {
          unique_user_company_app_grant: {
            userId,
            companyId,
            appId: app.id
          }
        }
      })
    ])

    return Boolean(entitlement?.enabled && grant?.granted)
  }
}
