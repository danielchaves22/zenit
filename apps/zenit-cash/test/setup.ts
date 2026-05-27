import '@testing-library/jest-dom/vitest'
import { afterEach, vi } from 'vitest'
import { cleanup } from '@testing-library/react'
import { createElement } from 'react'

afterEach(() => {
  cleanup()
  localStorage.clear()
  document.cookie = 'zenit_sso_token=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/'
})

Object.defineProperty(window, 'matchMedia', {
  writable: true,
  value: vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn()
  }))
})

class ResizeObserverMock {
  observe() {}
  unobserve() {}
  disconnect() {}
}

vi.mock('next/image', () => ({
  default: (props: Record<string, unknown>) => {
    const { alt = '', priority: _priority, ...rest } = props
    return createElement('img', { alt: String(alt), ...rest })
  }
}))

Object.assign(globalThis, {
  ResizeObserver: ResizeObserverMock
})
