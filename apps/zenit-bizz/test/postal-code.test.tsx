import { useState } from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ContactAddresses } from '@/components/ContactAddresses';
import { AddressDraft, emptyAddress } from '@/lib/contact-addresses';
import { api, ApiError } from '@/lib/api';

vi.mock('@/lib/api', async (original) => ({ ...(await original<object>()), api: vi.fn() }));
const result = {
  postalCode: '01001000',
  street: 'Praça da Sé',
  neighborhood: 'Sé',
  location: { stateCode: 'SP', cityCode: '3550308' }
};
function Form({
  disabled = false,
  companyId = 23,
  initial = [emptyAddress()]
}: {
  disabled?: boolean;
  companyId?: number;
  initial?: AddressDraft[];
}) {
  const [values, setValues] = useState(initial);
  return (
    <>
      <ContactAddresses
        values={values}
        onChange={setValues}
        companyId={companyId}
        disabled={disabled}
      />
      <pre data-testid="addresses">{JSON.stringify(values)}</pre>
    </>
  );
}
function values(): AddressDraft[] {
  return JSON.parse(screen.getByTestId('addresses').textContent!);
}
function postalCalls() {
  return vi.mocked(api).mock.calls.filter(([path]) => path.includes('/postal-codes/'));
}
function typeCep(cep = '01001000', index = 0) {
  if (!screen.queryByLabelText('CEP'))
    fireEvent.click(screen.getByRole('button', { name: `Editar endereço ${index + 1}` }));
  fireEvent.change(screen.getAllByLabelText('CEP')[index], { target: { value: cep } });
}
async function advance() {
  await act(() => vi.advanceTimersByTimeAsync(400));
}
let resolveLookup: (value: typeof result) => void;
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  vi.mocked(api).mockImplementation(async (path) => {
    if (path.endsWith('/states')) return [{ id: 35, code: 'SP', name: 'São Paulo' }] as never;
    if (path.endsWith('/cities'))
      return [{ code: '3550308', name: 'São Paulo', stateCode: 'SP' }] as never;
    return new Promise((resolve) => {
      resolveLookup = resolve;
    }) as never;
  });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('automatic address lookup', () => {
  it('only queries edited, complete CEPs, fills the address, and keeps all fields editable', async () => {
    render(
      <Form
        initial={[
          {
            ...emptyAddress(),
            postalCode: '01001000',
            addressNumber: '15',
            complement: 'Sala 2'
          }
        ]}
      />
    );
    await advance();
    expect(postalCalls()).toHaveLength(0);
    typeCep('01001');
    await advance();
    expect(postalCalls()).toHaveLength(0);
    typeCep();
    expect(screen.getByLabelText('CEP')).toHaveValue('01001-000');
    await advance();
    expect(screen.getByRole('status')).toHaveTextContent('Consultando CEP');
    await act(async () => resolveLookup(result));
    expect(screen.getByLabelText('Logradouro')).toHaveValue('Praça da Sé');
    expect(screen.getByLabelText('Bairro')).toHaveValue('Sé');
    expect(screen.getByLabelText('Estado')).toHaveValue('SP');
    expect(screen.getByRole('combobox', { name: 'Cidade' })).toHaveTextContent('São Paulo');
    fireEvent.change(screen.getByLabelText('Logradouro'), {
      target: { value: 'Praça da Sé — entrada lateral' }
    });
    fireEvent.blur(screen.getByLabelText('CEP'));
    await advance();
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar endereço' }));
    expect(values()[0]).toMatchObject({
      ...result,
      street: 'Praça da Sé — entrada lateral',
      addressNumber: '15',
      complement: 'Sala 2'
    });
    expect(postalCalls()).toHaveLength(1);
    fireEvent.click(screen.getByRole('button', { name: 'Editar endereço 1' }));
    await advance();
    expect(screen.getByLabelText('Estado')).toBeEnabled();
    expect(screen.getByRole('combobox', { name: 'Cidade' })).toBeEnabled();
  });
  it('ignores stale responses and preserves manual edits made during the current request', async () => {
    render(<Form />);
    typeCep();
    await advance();
    const oldResolve = resolveLookup;
    typeCep('01002000');
    await advance();
    expect((postalCalls()[0][1]?.signal as AbortSignal).aborted).toBe(true);
    fireEvent.change(screen.getByLabelText('Logradouro'), {
      target: { value: 'Rua corrigida' }
    });
    fireEvent.change(screen.getByLabelText('Estado'), { target: { value: 'SP' } });
    await act(async () => resolveLookup({ ...result, postalCode: '01002000' }));
    await act(async () => oldResolve({ ...result, neighborhood: 'Resposta antiga' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar endereço' }));
    expect(values()[0]).toMatchObject({
      postalCode: '01002000',
      street: 'Rua corrigida',
      neighborhood: 'Sé',
      location: { stateCode: 'SP', cityCode: null }
    });
  });
  it('preserves existing street and neighborhood for a municipal CEP with empty fields', async () => {
    render(
      <Form initial={[{ ...emptyAddress(), street: 'Estrada local', neighborhood: 'Centro' }]} />
    );
    typeCep();
    await advance();
    await act(async () => resolveLookup({ ...result, street: '', neighborhood: '' }));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar endereço' }));
    expect(values()[0]).toMatchObject({
      street: 'Estrada local',
      neighborhood: 'Centro',
      location: result.location
    });
  });
  it('cancels a discarded lookup and keeps a new lookup attached to the edited address', async () => {
    render(<Form initial={[emptyAddress(), { ...emptyAddress(), label: 'Entrega' }]} />);
    typeCep('01001000');
    await advance();
    const firstResolve = resolveLookup;
    fireEvent.click(screen.getByRole('button', { name: 'Cancelar endereço' }));
    fireEvent.click(screen.getByRole('button', { name: 'Editar endereço 2' }));
    typeCep('01002000');
    await advance();
    const secondResolve = resolveLookup;
    fireEvent.click(screen.getByLabelText('Endereço principal'));
    await act(async () => {
      firstResolve(result);
      secondResolve({ ...result, postalCode: '01002000', street: 'Rua da entrega' });
    });
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar endereço' }));
    expect(values().map(({ postalCode, street }) => ({ postalCode, street }))).toEqual([
      { postalCode: '01002000', street: 'Rua da entrega' },
      { postalCode: '', street: '' }
    ]);
  });
  it('shows a retryable failure without clearing manual data', async () => {
    vi.mocked(api).mockRejectedValueOnce(new Error('states unavailable'));
    render(<Form initial={[{ ...emptyAddress(), street: 'Rua manual' }]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Editar endereço 1' }));
    vi.mocked(api).mockRejectedValueOnce(
      new ApiError(404, 'CEP não encontrado. Preencha o endereço manualmente.')
    );
    typeCep();
    await advance();
    const error = screen.getByText('CEP não encontrado. Preencha o endereço manualmente.');
    expect(values()[0].street).toBe('Rua manual');
    fireEvent.click(within(error).getByRole('button', { name: 'Tentar novamente' }));
    await advance();
    await act(async () => resolveLookup(result));
    fireEvent.click(screen.getByRole('button', { name: 'Confirmar endereço' }));
    expect(values()[0].street).toBe('Praça da Sé');
    expect(screen.queryByText(/CEP não encontrado/)).not.toBeInTheDocument();
  });
  it.each(['save', 'company', 'remove'])('cancels pending results on %s', async (action) => {
    const { rerender } = render(<Form />);
    typeCep();
    await advance();
    if (action === 'save') rerender(<Form disabled />);
    else if (action === 'company') rerender(<Form companyId={24} />);
    else {
      fireEvent.click(screen.getByRole('button', { name: 'Cancelar endereço' }));
    }
    await act(async () => resolveLookup(result));
    expect((postalCalls()[0][1]?.signal as AbortSignal).aborted).toBe(true);
    expect(values().every((address) => !address.street)).toBe(true);
    await advance();
    expect(postalCalls()).toHaveLength(1);
  });
});
