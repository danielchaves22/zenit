import { AppKey } from '@prisma/client'

export const APP_HEADER = 'x-app-key'

export const APP_KEY_BY_HEADER: Record<string, AppKey> = {
  'zenit-cash': AppKey.ZENIT_CASH,
  'zenit-calc': AppKey.ZENIT_CALC,
  'zenit-admin': AppKey.ZENIT_ADMIN,
  'zenit-whatsapp': AppKey.ZENIT_WHATSAPP
}

export const APP_HEADER_BY_KEY: Record<AppKey, string> = {
  [AppKey.ZENIT_CASH]: 'zenit-cash',
  [AppKey.ZENIT_CALC]: 'zenit-calc',
  [AppKey.ZENIT_ADMIN]: 'zenit-admin',
  [AppKey.ZENIT_WHATSAPP]: 'zenit-whatsapp'
}

export function toPrismaAppKey(headerValue: string | undefined | null): AppKey | null {
  if (!headerValue) return null
  return APP_KEY_BY_HEADER[headerValue] || null
}

export function toHeaderAppKey(appKey: AppKey): string {
  return APP_HEADER_BY_KEY[appKey]
}
