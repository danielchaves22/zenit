import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { Contacts } from '@/components/Contacts';
import { LegacyContactRedirect } from '@/components/LegacyContactRedirect';
import { api } from '@/lib/api';

const state = vi.hoisted(() => ({
  router: {
    isReady: true,
    asPath: '/pessoas',
    query: {} as Record<string, string>,
    replace: vi.fn()
  },
  company: { id: 23 }
}));
vi.mock('next/router', () => ({ useRouter: () => state.router }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ company: state.company }) }));
vi.mock('@/contexts/NavigationContext', () => ({
  useNavigation: () => ({ notice: '', setNotice: vi.fn() })
}));
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
beforeEach(() => {
  vi.clearAllMocks();
  state.router.query = {};
  state.router.asPath = '/pessoas';
  vi.mocked(api).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 20 });
});

describe('unified people directory', () => {
  it('loads all relationships and labels an unclassified person without calling them a supplier', async () => {
    vi.mocked(api).mockResolvedValue({
      items: [
        {
          id: 'ana',
          name: 'Ana',
          personType: 'PERSON',
          isCustomer: false,
          isSupplier: false,
          active: true
        }
      ],
      total: 1
    });
    render(<Contacts />);
    await screen.findByRole('link', { name: 'Ana' });
    expect(api).toHaveBeenCalledWith(
      '/bizz/contacts?role=all&personType=all&q=&status=active&page=1',
      expect.objectContaining({ companyId: 23 })
    );
    expect(screen.getByRole('cell', { name: 'Sem relacionamento' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Editar Ana' })).toHaveAttribute(
      'href',
      '/pessoas/ana?q=&role=all&personType=all&status=active&page=1'
    );
  });
  it('keeps filters in edit links and resets pagination after changing a relationship', async () => {
    state.router.query = {
      role: 'both',
      personType: 'BUSINESS',
      status: 'inactive',
      page: '3',
      q: 'Flores'
    };
    render(<Contacts />);
    await screen.findByRole('heading', { name: 'Nenhum cadastro encontrado' });
    expect(screen.getByRole('link', { name: 'Novo cadastro' })).toHaveAttribute(
      'href',
      '/pessoas/novo?q=Flores&role=both&personType=BUSINESS&status=inactive&page=3'
    );
    fireEvent.change(screen.getByLabelText('Relacionamento'), { target: { value: 'none' } });
    expect(state.router.replace).toHaveBeenCalledWith(
      {
        pathname: '/pessoas',
        query: { q: 'Flores', role: 'none', personType: 'BUSINESS', status: 'inactive', page: '1' }
      },
      undefined,
      { shallow: true, scroll: false }
    );
  });
  it.each([
    { role: 'customer' as const, creating: false, editing: false, destination: '/pessoas' },
    { role: 'supplier' as const, creating: true, editing: false, destination: '/pessoas/novo' },
    {
      role: 'supplier' as const,
      creating: false,
      editing: true,
      destination: '/pessoas/existing-id'
    }
  ])(
    'redirects legacy $role URLs to $destination with their list context',
    async ({ role, creating, editing, destination }) => {
      state.router.query = { id: 'existing-id', q: 'Flores', status: 'inactive', page: '2' };
      render(<LegacyContactRedirect role={role} creating={creating} editing={editing} />);
      await waitFor(() =>
        expect(state.router.replace).toHaveBeenCalledWith({
          pathname: destination,
          query: { q: 'Flores', role, personType: 'all', status: 'inactive', page: '2' }
        })
      );
    }
  );
});
