import type { ButtonHTMLAttributes, ReactNode } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import OperationsPage from '@/pages/admin/operations'
import api from '@/lib/api'

const addToastMock = vi.fn()

vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: ReactNode }) => (
    <a href={href}>{children}</a>
  )
}))

vi.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children }: { children: ReactNode }) => <div>{children}</div>
}))

vi.mock('@/components/ui/AccessGuard', () => ({
  AccessGuard: ({ children }: { children: ReactNode }) => <>{children}</>
}))

vi.mock('@/components/ui/Breadcrumb', () => ({
  Breadcrumb: () => null
}))

vi.mock('@/components/ui/Button', () => ({
  Button: ({
    children,
    variant: _variant,
    ...props
  }: ButtonHTMLAttributes<HTMLButtonElement> & {
    children: ReactNode
    variant?: string
  }) => <button {...props}>{children}</button>
}))

vi.mock('@/components/ui/Card', () => ({
  Card: ({ children }: { children: ReactNode }) => <section>{children}</section>
}))

vi.mock('@/components/ui/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock })
}))

vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn()
  }
}))

const overview = {
  status: 'WARNING',
  jobs: [
    {
      displayName: 'Materializacao diaria de transacoes fixas',
      schedule: 'Startup e depois de hora em hora',
      healthStatus: 'WARNING',
      healthMessage: 'Ultima execucao concluiu com alertas',
      recentRuns: [
        {
          id: 10,
          status: 'PARTIAL',
          startedAt: '2026-09-08T21:41:56.000Z',
          durationMs: 7700,
          processedCount: 29,
          createdCount: 0,
          failedCount: 2,
          companyErrorDetailCount: 2,
          countsScope: 'GLOBAL',
          errorDetailsScope: 'COMPANY',
          errorMessage: null,
          errorDetails: [
            {
              templateId: 197,
              companyId: 42,
              error: 'A data informada direciona esta compra para uma fatura ja fechada.'
            },
            {
              templateId: 198,
              companyId: 42,
              error: 'Categoria financeira nao encontrada para a empresa.'
            }
          ]
        },
        {
          id: 11,
          status: 'FAILED',
          startedAt: '2026-09-08T20:00:00.000Z',
          durationMs: 150,
          processedCount: 0,
          createdCount: 0,
          failedCount: 1,
          companyErrorDetailCount: 0,
          countsScope: 'GLOBAL',
          errorDetailsScope: 'COMPANY',
          errorMessage: 'A execucao global falhou. Detalhes tecnicos globais nao sao exibidos neste painel.',
          errorDetails: {
            stack: 'Error: conexao indisponivel\n    at materialize (job.ts:20:3)'
          }
        },
        {
          id: 12,
          status: 'PARTIAL',
          startedAt: '2026-09-08T19:00:00.000Z',
          durationMs: 200,
          processedCount: 1,
          createdCount: 0,
          failedCount: 1,
          companyErrorDetailCount: 0,
          countsScope: 'GLOBAL',
          errorDetailsScope: 'COMPANY',
          errorMessage: null,
          errorDetails: {
            code: 'UNKNOWN_DETAIL_SHAPE'
          }
        }
      ]
    }
  ],
  issues: {
    creditCardInvoiceProjectionBlocks: [],
    creditCardConfigurationIssues: []
  }
}

describe('OperationsPage job details', () => {
  beforeEach(() => {
    addToastMock.mockReset()
    vi.mocked(api.get).mockReset()
    vi.mocked(api.get).mockResolvedValue({ data: overview })
  })

  it('expande erros parciais e fatais com contexto legivel e fallback seguro', async () => {
    const user = userEvent.setup()

    render(<OperationsPage />)

    const detailButtons = await screen.findAllByRole('button', {
      name: 'Ver detalhes da execução'
    })
    expect(detailButtons).toHaveLength(3)
    expect(detailButtons[0]).toHaveAttribute('aria-expanded', 'false')
    expect(screen.getByText(/status e contadores são globais/i)).toBeInTheDocument()
    expect(screen.getByRole('columnheader', { name: 'Falhas (global)' })).toBeInTheDocument()
    expect(screen.getByText('2 detalhada(s) nesta empresa')).toBeInTheDocument()

    await user.click(detailButtons[0])

    expect(detailButtons[0]).toHaveAttribute('aria-expanded', 'true')
    expect(
      screen.getByRole('button', { name: 'Ocultar detalhes da execução' })
    ).toBeInTheDocument()
    expect(screen.getByText('Template 197 - Empresa 42')).toBeInTheDocument()
    expect(
      screen.getByText('A data informada direciona esta compra para uma fatura ja fechada.')
    ).toBeInTheDocument()
    expect(screen.getByText('Template 198 - Empresa 42')).toBeInTheDocument()

    await user.click(detailButtons[1])

    expect(
      screen.getByText(
        'A execucao global falhou. Detalhes tecnicos globais nao sao exibidos neste painel.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText('Rastreamento técnico')).not.toBeInTheDocument()
    expect(screen.queryByText(/Error: conexao indisponivel/)).not.toBeInTheDocument()

    await user.click(detailButtons[2])

    expect(
      screen.getByText(
        'Não há falhas detalhadas desta empresa para esta execução global.'
      )
    ).toBeInTheDocument()
    expect(screen.queryByText(/UNKNOWN_DETAIL_SHAPE/)).not.toBeInTheDocument()

    await user.click(
      screen.getAllByRole('button', { name: 'Ocultar detalhes da execução' })[0]
    )

    expect(screen.queryByText('Template 197 - Empresa 42')).not.toBeInTheDocument()
  })
})
