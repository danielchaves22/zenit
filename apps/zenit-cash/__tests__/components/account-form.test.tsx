import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import AccountForm from '@/components/financial/AccountForm';
import api from '@/lib/api';

const pushMock = vi.fn();
const addToastMock = vi.fn();

vi.mock('next/router', () => ({ useRouter: () => ({ push: pushMock }) }));
vi.mock('@/components/ui/ToastContext', () => ({
  useToast: () => ({ addToast: addToastMock })
}));
vi.mock('@/lib/api', () => ({
  default: {
    get: vi.fn(), post: vi.fn(), put: vi.fn(),
    defaults: { baseURL: 'http://localhost:3000/api' }
  }
}));

const banks = [
  { id: 1, code: 'NUBANK', name: 'Nubank', iconSlug: 'nubank', iconPath: '/banks/nubank.svg', displayOrder: 1, isActive: true },
  { id: 2, code: 'BRADESCO', name: 'Bradesco', iconSlug: 'bradesco', iconPath: '/banks/bradesco.svg', displayOrder: 2, isActive: true }
];
const savedAccount = {
  id: 10, name: 'Conta principal', type: 'CHECKING', balance: '125.00',
  bankId: 1, bankName: 'Nubank', bankCode: 'NUBANK', bank: banks[0],
  isActive: true, isDefault: false, allowNegativeBalance: false
};

function mockAccount(overrides: Record<string, unknown> = {}) {
  vi.mocked(api.get).mockImplementation(async (url) => ({
    data: url === '/financial/banks' ? banks : { ...savedAccount, ...overrides }
  }));
}

describe('Financial account bank logos', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAccount();
    vi.mocked(api.post).mockResolvedValue({ data: savedAccount });
    vi.mocked(api.put).mockResolvedValue({ data: savedAccount });
  });

  it('searches the shared bank dropdown, previews the logo and creates the account with its bank', async () => {
    const user = userEvent.setup();
    const { container } = render(<AccountForm mode="create" />);
    await user.type(await screen.findByPlaceholderText('Ex: Conta Corrente Banco ABC'), 'Minha conta');
    await user.click(screen.getByRole('button', { name: 'Selecione um banco' }));
    await user.type(screen.getByPlaceholderText('Buscar banco...'), 'núbank');
    expect(screen.queryByRole('button', { name: 'Bradesco' })).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Nubank' }));
    expect(container.querySelectorAll('img[src="http://localhost:3000/banks/nubank.svg"]')).toHaveLength(2);
    await user.click(screen.getByRole('button', { name: 'Criar Conta' }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith('/financial/accounts', expect.objectContaining({
      name: 'Minha conta', type: 'CHECKING', bankId: 1, bankName: null, bankCode: null
    })));
  }, 20_000);

  it('loads the saved bank, allows changing it and restores the new selection when reopened', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<AccountForm mode="edit" accountId="10" />);
    await user.click(await screen.findByRole('button', { name: 'Nubank' }));
    await user.click(screen.getByRole('button', { name: 'Bradesco' }));
    expect(screen.queryByPlaceholderText('Buscar banco...')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Bradesco' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/financial/accounts/10', expect.objectContaining({ bankId: 2 })));
    unmount();
    mockAccount({ bankId: 2, bankName: 'Bradesco', bankCode: 'BRADESCO', bank: banks[1] });
    render(<AccountForm mode="edit" accountId="10" />);
    expect(await screen.findByRole('button', { name: 'Bradesco' })).toBeInTheDocument();
  }, 20_000);

  it('removes the bank and its preview through Sem banco definido', async () => {
    const user = userEvent.setup();
    const { container } = render(<AccountForm mode="edit" accountId="10" />);
    await user.click(await screen.findByRole('button', { name: 'Nubank' }));
    await user.click(screen.getByRole('button', { name: 'Sem banco definido' }));
    expect(container.querySelector('img')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/financial/accounts/10', expect.objectContaining({
      bankId: null, bankName: null, bankCode: null
    })));
  });

  it('recognizes a legacy bank name using the same matching as credit cards', async () => {
    mockAccount({ bankId: null, bankName: 'Núbank', bankCode: null, bank: null });
    render(<AccountForm mode="edit" accountId="10" />);
    expect(await screen.findByRole('button', { name: 'Nubank' })).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledWith('/financial/accounts/10', expect.objectContaining({ bankId: 1 })));
  });

  it.each([null, 99])('preserves an unmatched bank until explicitly cleared (bankId: %s)', async (bankId) => {
    mockAccount({ bankId, bankName: 'Banco antigo', bankCode: 'ANTIGO', bank: null });
    const user = userEvent.setup();
    render(<AccountForm mode="edit" accountId="10" onSuccess={() => {}} />);
    await user.click(await screen.findByRole('button', { name: 'Salvar Alterações' }));
    await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1));
    const payload = vi.mocked(api.put).mock.calls[0][1];
    expect(payload).not.toHaveProperty('bankId');
    expect(payload).not.toHaveProperty('bankName');
    expect(payload).not.toHaveProperty('bankCode');
    await user.click(screen.getByRole('button', { name: 'Banco antigo' }));
    await user.click(screen.getByRole('button', { name: 'Sem banco definido' }));
    await user.click(screen.getByRole('button', { name: 'Salvar Alterações' }));
    await waitFor(() => expect(api.put).toHaveBeenLastCalledWith('/financial/accounts/10', expect.objectContaining({ bankId: null })));
  });
});
