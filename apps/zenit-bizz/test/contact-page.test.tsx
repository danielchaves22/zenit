import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ContactPage } from '@/components/ContactPage';
import { api } from '@/lib/api';
const state = vi.hoisted(() => ({
  company: { id: 23 },
  router: {
    isReady: true,
    query: { id: 'contact-a', q: 'Flores', status: 'inactive', page: '2' },
    push: vi.fn()
  },
  complete: vi.fn((action: () => void) => action()),
  setNotice: vi.fn()
}));
vi.mock('next/router', () => ({ useRouter: () => state.router }));
vi.mock('@/contexts/AuthContext', () => ({ useAuth: () => ({ company: state.company }) }));
vi.mock('@/contexts/NavigationContext', () => ({ useNavigation: () => state }));
vi.mock('@/lib/api', () => ({ api: vi.fn() }));
vi.mock('@/components/Layout', () => ({ Layout: ({ children }: any) => children }));
vi.mock('@/components/ContactForm', () => ({
  ContactForm: ({ contact, companyId, onSaved }: any) => (
    <div>
      <span>
        {companyId}: {contact?.name}
      </span>
      <button onClick={() => onSaved(contact)}>Salvar</button>
    </div>
  )
}));
beforeEach(() => {
  vi.clearAllMocks();
  state.company = { id: 23 };
});
describe('contact page', () => {
  it('loads an edit URL with the active company', async () => {
    vi.mocked(api).mockResolvedValue({ id: 'contact-a', name: 'Flores da Serra' });
    render(<ContactPage role="supplier" editing />);
    await screen.findByText('23: Flores da Serra');
    expect(api).toHaveBeenCalledWith(
      '/bizz/contacts/contact-a',
      expect.objectContaining({ companyId: 23 })
    );
    fireEvent.click(screen.getByRole('button', { name: 'Salvar' }));
    expect(state.complete).toHaveBeenCalled();
    expect(state.router.push).toHaveBeenCalledWith({
      pathname: '/fornecedores',
      query: { q: 'Flores', status: 'inactive', page: '2' }
    });
    expect(state.setNotice).toHaveBeenCalledWith('Flores da Serra: cadastro salvo.');
  });
  it('discards a late response after changing company', async () => {
    let resolveFirst!: (value: unknown) => void;
    vi.mocked(api)
      .mockImplementationOnce(
        () =>
          new Promise((resolve) => {
            resolveFirst = resolve;
          })
      )
      .mockResolvedValueOnce({ id: 'contact-a', name: 'Outro cadastro' });
    const view = render(<ContactPage role="customer" editing />);
    const signal = vi.mocked(api).mock.calls[0][1]?.signal;
    state.company = { id: 24 };
    view.rerender(<ContactPage role="customer" editing />);
    await screen.findByText('24: Outro cadastro');
    resolveFirst({ id: 'contact-a', name: 'Empresa anterior' });
    await waitFor(() => expect(signal?.aborted).toBe(true));
    expect(screen.queryByText(/Empresa anterior/)).toBeNull();
  });
  it('offers recovery without opening a form for a missing contact', async () => {
    vi.mocked(api).mockRejectedValue(new Error('Cadastro não encontrado nesta empresa.'));
    render(<ContactPage role="customer" editing />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Cadastro não encontrado nesta empresa.'
    );
    expect(screen.queryByRole('button', { name: 'Salvar' })).toBeNull();
    expect(screen.getByRole('link', { name: 'Voltar' })).toHaveAttribute(
      'href',
      '/clientes?q=Flores&status=inactive&page=2'
    );
  });
});
