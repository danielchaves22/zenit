import { act, render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { Sidebar } from '@/components/layout/Sidebar';

const state = vi.hoisted(() => ({
  router: { pathname: '/', asPath: '/', query: {}, push: vi.fn() },
  auth: { userRole: 'ADMIN', isCompanyOwner: true, manageFinancialAccounts: true, manageFinancialCategories: true,
    userName: 'Pessoa Teste', companyName: 'Meu espaço', user: { companies: [{ id: 1 }] }, hasCurrentAppAccess: true, logout: vi.fn() },
}));
vi.mock('next/router', () => ({ useRouter: () => state.router }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => state.auth }));
vi.mock('@/contexts/ThemeContext', () => ({ useTheme: () => ({ colorMode: 'light', changeColorMode: vi.fn() }) }));
vi.mock('@/components/assistant/AssistantFloatingChat', () => ({ AssistantFloatingChat: () => null }));
vi.mock('@/components/ui/ThemeSelector', () => ({ ThemeSelector: () => null }));
vi.mock('@/components/ui/CompanySwitcherModal', () => ({ CompanySwitcherModal: () => null }));

describe('Cash navigation', () => {
  beforeEach(() => {
    state.router.pathname = '/'; state.router.asPath = '/';
    state.auth.userRole = 'ADMIN'; state.auth.manageFinancialAccounts = true; state.auth.manageFinancialCategories = true;
    vi.mocked(window.matchMedia).mockImplementation(query => ({ matches: false, media: query, addEventListener: vi.fn(), removeEventListener: vi.fn() }) as unknown as MediaQueryList);
  });

  it('keeps primary destinations as links and expands secondary destinations by click', async () => {
    const user = userEvent.setup();
    render(<Sidebar isCollapsed={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Transações' })).toHaveAttribute('href', '/financial/transactions');
    expect(screen.getByRole('link', { name: 'Contas' })).toHaveAttribute('href', '/financial/accounts');
    expect(screen.queryByRole('link', { name: 'Nova receita' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Expandir opções de Transações' }));
    expect(screen.getByRole('link', { name: 'Nova receita' })).toHaveAttribute('href', '/financial/transactions/new?type=INCOME&locked=true');
    await user.click(screen.getByRole('button', { name: 'Recolher opções de Transações' }));
    expect(screen.queryByRole('link', { name: 'Nova receita' })).not.toBeInTheDocument();
  });

  it('opens collapsed submenus with a keyboard and restores focus on Escape', async () => {
    const user = userEvent.setup();
    render(<Sidebar isCollapsed onToggle={vi.fn()} />);
    const trigger = screen.getByRole('button', { name: 'Transações' });
    trigger.focus(); await user.keyboard('{Enter}');
    const first = screen.getByRole('link', { name: 'Todas as transações' });
    expect(first).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('link', { name: 'Todas as transações' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('does not expose account or admin destinations to users without permission', async () => {
    state.auth.userRole = 'USER'; state.auth.manageFinancialAccounts = false; state.auth.manageFinancialCategories = false;
    render(<Sidebar isCollapsed={false} onToggle={vi.fn()} />);
    expect(screen.queryByRole('link', { name: 'Contas' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Cartões' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Ajustes' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Transações' })).toBeVisible();
  });

  it('marks the exact budget view and keeps the parent selected on detail routes', () => {
    state.router.pathname = '/financial/budgets'; state.router.asPath = '/financial/budgets?view=provisions';
    const { rerender } = render(<Sidebar isCollapsed={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Provisões' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Planejamento mensal' })).not.toHaveAttribute('aria-current');
    state.router.pathname = '/financial/accounts/[id]/reconciliation'; state.router.asPath = '/financial/accounts/1/reconciliation';
    rerender(<Sidebar isCollapsed={false} onToggle={vi.fn()} />);
    expect(screen.getByRole('link', { name: 'Contas' })).toHaveAttribute('aria-current', 'page');
  });

  it('restores and persists the desktop collapse preference without resetting it on mobile', async () => {
    let onResize: (() => void) | undefined;
    const media = { matches: false, addEventListener: (_: string, callback: () => void) => { onResize = callback; }, removeEventListener: vi.fn() };
    vi.mocked(window.matchMedia).mockReturnValue(media as unknown as MediaQueryList);
    localStorage.setItem('sidebarCollapsed', 'true');
    const user = userEvent.setup();
    render(<DashboardLayout><h1>Conteúdo</h1></DashboardLayout>);
    expect(screen.getByRole('button', { name: 'Expandir menu' })).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Expandir menu' }));
    expect(localStorage.getItem('sidebarCollapsed')).toBe('false');
    act(() => { media.matches = true; onResize?.(); });
    await user.click(screen.getByRole('button', { name: 'Abrir navegação' }));
    const dialog = screen.getByRole('dialog', { name: 'Navegação do Zenit Cash' });
    expect(within(dialog).getByRole('link', { name: 'Contas' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(localStorage.getItem('sidebarCollapsed')).toBe('false');
    act(() => { media.matches = false; onResize?.(); });
    expect(screen.getByRole('button', { name: 'Recolher menu' })).toBeInTheDocument();
  });

  it('tolerates a malformed stored sidebar preference', () => {
    localStorage.setItem('sidebarCollapsed', 'invalid-json');
    render(<DashboardLayout><p>Conteúdo</p></DashboardLayout>);
    expect(screen.getByRole('button', { name: 'Recolher menu' })).toBeVisible();
  });
});
