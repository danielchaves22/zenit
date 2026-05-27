import { describe, expect, it } from 'vitest'
import { hasAppAccess, pickAccessibleCompanyId } from '@/lib/auth-access'

const user = {
  companies: [{ id: 1 }, { id: 2 }, { id: 3 }],
  appAccessByCompany: {
    1: [{ appKey: 'zenit-admin', allowed: true }],
    2: [{ appKey: 'zenit-cash', allowed: false }],
    3: [{ appKey: 'zenit-cash', allowed: true }]
  }
}

describe('auth access helpers', () => {
  it('detects current app access for the active company', () => {
    expect(hasAppAccess(user, 3, 'zenit-cash')).toBe(true)
    expect(hasAppAccess(user, 2, 'zenit-cash')).toBe(false)
    expect(hasAppAccess(null, 3, 'zenit-cash')).toBe(false)
  })

  it('picks the first company that grants access to the app', () => {
    expect(pickAccessibleCompanyId(user, 'zenit-cash')).toBe(3)
    expect(pickAccessibleCompanyId({ companies: [{ id: 1 }], appAccessByCompany: {} }, 'zenit-cash')).toBeNull()
  })
})
