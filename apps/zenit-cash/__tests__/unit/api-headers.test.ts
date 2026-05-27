import { describe, expect, it } from 'vitest'
import { buildSessionHeaders } from '@/lib/api-headers'

describe('buildSessionHeaders', () => {
  it('adds app key even without session data', () => {
    const headers = buildSessionHeaders(null, 'zenit-cash')

    expect(headers).toEqual({
      'X-App-Key': 'zenit-cash'
    })
  })

  it('includes auth token and active company when present', () => {
    const storage = {
      getItem(key: string) {
        return {
          zenit_sso_token: 'token-123',
          zenit_sso_company_id: '42'
        }[key] ?? null
      }
    }

    const headers = buildSessionHeaders(storage, 'zenit-cash')

    expect(headers).toEqual({
      Authorization: 'Bearer token-123',
      'X-App-Key': 'zenit-cash',
      'X-Company-Id': '42'
    })
  })
})
