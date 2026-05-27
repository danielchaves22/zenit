import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import LoginPage from '@/pages/login'

const replaceMock = vi.fn()
const loginMock = vi.fn()

vi.mock('next/router', () => ({
  useRouter: () => ({
    query: {},
    replace: replaceMock
  })
}))

vi.mock('@/contexts/AuthContext', () => ({
  useAuth: () => ({
    login: loginMock
  })
}))

describe('LoginPage', () => {
  beforeEach(() => {
    loginMock.mockReset()
    replaceMock.mockReset()
  })

  it('redirects to the dashboard after a successful login', async () => {
    loginMock.mockResolvedValue({
      mustChangePassword: false
    })

    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => {
      expect(loginMock).toHaveBeenCalledWith('user@example.com', 'secret123')
      expect(replaceMock).toHaveBeenCalledWith('/')
    })
  })

  it('redirects to first access when password rotation is required', async () => {
    loginMock.mockResolvedValue({
      mustChangePassword: true
    })

    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'secret123')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    await waitFor(() => {
      expect(replaceMock).toHaveBeenCalledWith('/first-access')
    })
  })

  it('shows the backend error message when login fails', async () => {
    loginMock.mockRejectedValue({
      response: {
        data: {
          error: 'Credenciais invalidas'
        }
      }
    })

    render(<LoginPage />)

    await userEvent.type(screen.getByLabelText('Email'), 'user@example.com')
    await userEvent.type(screen.getByLabelText('Senha'), 'wrong-password')
    await userEvent.click(screen.getByRole('button', { name: 'Entrar' }))

    expect(await screen.findByText('Credenciais invalidas')).toBeInTheDocument()
  })
})
