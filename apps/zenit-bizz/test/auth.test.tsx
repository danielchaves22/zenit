import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AuthProvider } from '@/contexts/AuthContext';
import { AuthGate } from '@/components/AuthGate';
import { api } from '@/lib/api';
import { User } from '@/lib/types';
import { SSO_STORAGE_KEYS } from '@zenit/shared-users-core';
vi.mock('@/lib/api', () => ({ api: vi.fn(), clearSession: vi.fn(), storeSession: vi.fn() }));
const user: User = {
  id: 1,
  name: 'Teste',
  email: 'teste@example.test',
  mustChangePassword: false,
  companies: [{ id: 23, name: 'Empresa teste', role: 'USER', isDefault: true }],
  appAccessByCompany: { '23': [{ appKey: 'zenit-bizz', enabled: true, granted: true, allowed: true }] }
};
beforeEach(() => {
  vi.resetAllMocks();
  localStorage.setItem(SSO_STORAGE_KEYS.token, 'test');
});
function open() {
  return render(
    <AuthProvider>
      <AuthGate>
        <input aria-label="Rascunho" defaultValue="" />
      </AuthGate>
    </AuthProvider>
  );
}
describe('authenticated workspace', () => {
  it('keeps the draft mounted during a background access refresh', async () => {
    vi.mocked(api).mockResolvedValue({ user });
    open();
    const input = await screen.findByLabelText('Rascunho');
    fireEvent.change(input, { target: { value: 'Não perder' } });
    fireEvent(window, new Event('bizz:access-changed'));
    await waitFor(() => expect(api).toHaveBeenCalledTimes(2));
    expect(screen.getByLabelText('Rascunho')).toBe(input);
    expect(input).toHaveValue('Não perder');
  });
  it('removes workspace content after the individual grant is revoked', async () => {
    vi.mocked(api)
      .mockResolvedValueOnce({ user })
      .mockResolvedValueOnce({ user: { ...user, appAccessByCompany: {} } });
    open();
    await screen.findByLabelText('Rascunho');
    fireEvent(window, new Event('bizz:access-changed'));
    await screen.findByRole('heading', { name: 'Acesso ainda não liberado' });
    expect(screen.queryByLabelText('Rascunho')).toBeNull();
    expect(localStorage.getItem(SSO_STORAGE_KEYS.companyId)).toBeNull();
  });
  it('requires the initial password change before displaying business data', async () => {
    vi.mocked(api).mockResolvedValue({ user: { ...user, mustChangePassword: true } });
    open();
    await screen.findByRole('heading', { name: 'Defina sua nova senha' });
    expect(screen.queryByLabelText('Rascunho')).toBeNull();
  });
});
