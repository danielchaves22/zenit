import { render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { useProtectedRoute } from '@/hooks/useProtectedRoute'
import { useAuth } from '@/contexts/AuthContext'
import { useRouter } from 'next/router'

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: vi.fn()
}))

vi.mock('next/router', () => ({
  useRouter: vi.fn()
}))

const replace = vi.fn()

function mockRouter(pathname: string, asPath = pathname) {
  vi.mocked(useRouter).mockReturnValue({
    asPath,
    pathname,
    replace
  } as any)
}

function Harness() {
  const routeState = useProtectedRoute()

  return (
    <div>
      <span data-testid="can-render">{String(routeState.canRender)}</span>
      <span data-testid="is-authenticated">{String(routeState.isAuthenticated)}</span>
    </div>
  )
}

describe('useProtectedRoute', () => {
  beforeEach(() => {
    replace.mockReset()
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      user: null
    } as any)
    mockRouter('/', '/')
  })

  it('blocks private route rendering while redirecting anonymous users to login', async () => {
    mockRouter('/financial/dashboard', '/financial/dashboard?month=2026-08')

    render(<Harness />)

    expect(screen.getByTestId('can-render')).toHaveTextContent('false')
    expect(screen.getByTestId('is-authenticated')).toHaveTextContent('false')

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith({
        pathname: '/login',
        query: { redirect: '/financial/dashboard?month=2026-08' }
      })
    })
  })

  it('allows login rendering for anonymous users', () => {
    mockRouter('/login', '/login')

    render(<Harness />)

    expect(screen.getByTestId('can-render')).toHaveTextContent('true')
    expect(replace).not.toHaveBeenCalled()
  })

  it('blocks login rendering while redirecting authenticated users home', async () => {
    vi.mocked(useAuth).mockReturnValue({
      isLoading: false,
      user: { id: 1 }
    } as any)
    mockRouter('/login', '/login')

    render(<Harness />)

    expect(screen.getByTestId('can-render')).toHaveTextContent('false')

    await waitFor(() => {
      expect(replace).toHaveBeenCalledWith('/')
    })
  })
})
