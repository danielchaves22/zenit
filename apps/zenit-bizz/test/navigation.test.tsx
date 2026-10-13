import { useEffect } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { NavigationProvider, useNavigation } from '@/contexts/NavigationContext';
import { RouterContext } from 'next/dist/shared/lib/router-context.shared-runtime';
import { Breadcrumb } from '@/components/Breadcrumb';
const mock = vi.hoisted(() => ({
  listeners: new Map<string, (...args: any[]) => void>(),
  pop: vi.fn(),
  push: vi.fn()
}));
const events = {
  on: (event: string, action: (...args: any[]) => void) => mock.listeners.set(event, action),
  off: (event: string) => mock.listeners.delete(event),
  emit: vi.fn()
};
afterEach(() => vi.unstubAllGlobals());
vi.mock('next/router', () => ({
  useRouter: () => ({ events, push: mock.push, beforePopState: mock.pop })
}));
function Form({ busy = false, leave }: { busy?: boolean; leave: () => void }) {
  const { protect, request } = useNavigation();
  useEffect(() => {
    protect(true, busy);
    return () => protect(false, false);
  }, [protect, busy]);
  return <button onClick={() => request(leave)}>Sair</button>;
}
beforeEach(() => {
  vi.clearAllMocks();
  mock.listeners.clear();
  window.history.replaceState({ key: 'list' }, '', '/');
});
describe('unsaved navigation', () => {
  it('protects breadcrumb navigation and preserves the filtered destination after discard', () => {
    const destination = {
      pathname: '/pessoas',
      query: {
        q: 'Flores',
        role: 'supplier',
        personType: 'BUSINESS',
        status: 'inactive',
        page: '2'
      }
    };
    render(
      <RouterContext.Provider value={{ push: mock.push, prefetch: vi.fn(), isReady: true } as any}>
        <NavigationProvider>
          <Breadcrumb
            items={[
              { label: 'Relacionamento' },
              { label: 'Pessoas e empresas', href: destination },
              { label: 'Editar cadastro' }
            ]}
          />
          <Form leave={vi.fn()} />
        </NavigationProvider>
      </RouterContext.Provider>
    );
    const link = screen.getByRole('link', { name: 'Pessoas e empresas' });
    fireEvent.click(link);
    expect(mock.push).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toBeVisible();
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(mock.push).not.toHaveBeenCalled();
    fireEvent.click(link);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(mock.push).toHaveBeenCalledExactlyOnceWith(destination);
  });
  it('allows the approved Back when Next consumes the restoring pop after reload', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    render(
      <NavigationProvider>
        <Form leave={vi.fn()} />
      </NavigationProvider>
    );
    const onPop = mock.pop.mock.calls[0][0];
    act(() => {
      expect(onPop({ key: 'previous-entry' })).toBe(false);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(onPop({ key: 'previous-entry' })).toBe(true);
    go.mockRestore();
  });
  it('restores a forward traversal after reload using the browser entry index', () => {
    const navigation = { currentEntry: { index: 6 } };
    vi.stubGlobal('navigation', navigation);
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    render(
      <NavigationProvider>
        <Form leave={vi.fn()} />
      </NavigationProvider>
    );
    const onPop = mock.pop.mock.calls[0][0];
    navigation.currentEntry.index = 7;
    act(() => {
      expect(onPop({ key: 'unknown-after-reload' })).toBe(false);
    });
    expect(go).toHaveBeenCalledWith(-1);
    navigation.currentEntry.index = 6;
    expect(onPop({ key: 'list' })).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(go).toHaveBeenLastCalledWith(1);
    go.mockRestore();
  });
  it('requires an explicit discard and can keep editing', () => {
    const leave = vi.fn();
    render(
      <NavigationProvider>
        <Form leave={leave} />
      </NavigationProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    fireEvent.click(screen.getByRole('button', { name: 'Continuar editando' }));
    expect(leave).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(leave).toHaveBeenCalledTimes(1);
  });
  it('prevents leaving while a request is saving', () => {
    const leave = vi.fn();
    render(
      <NavigationProvider>
        <Form busy leave={leave} />
      </NavigationProvider>
    );
    fireEvent.click(screen.getByRole('button', { name: 'Sair' }));
    expect(leave).not.toHaveBeenCalled();
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('cancels refresh while there are unsaved changes', () => {
    render(
      <NavigationProvider>
        <Form leave={vi.fn()} />
      </NavigationProvider>
    );
    const event = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(event);
    expect(event.defaultPrevented).toBe(true);
  });
  it('restores the current history entry before asking to discard on Back', () => {
    const go = vi.spyOn(window.history, 'go').mockImplementation(() => {});
    render(
      <NavigationProvider>
        <Form leave={vi.fn()} />
      </NavigationProvider>
    );
    window.history.replaceState({ key: 'edit' }, '', '/');
    mock.listeners.get('routeChangeComplete')!();
    const onPop = mock.pop.mock.calls[0][0];
    act(() => {
      expect(onPop({ key: 'list' })).toBe(false);
    });
    expect(go).toHaveBeenCalledWith(1);
    expect(onPop({ key: 'edit' })).toBe(false);
    fireEvent.click(screen.getByRole('button', { name: 'Descartar' }));
    expect(go).toHaveBeenLastCalledWith(-1);
    expect(onPop({ key: 'list' })).toBe(true);
    go.mockRestore();
  });
});
