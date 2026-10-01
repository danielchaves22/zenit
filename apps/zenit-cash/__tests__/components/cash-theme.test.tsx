import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CASH_MODE_KEY, CASH_THEME_KEY, ThemeProvider, useTheme } from '@/contexts/ThemeContext';
import api from '@/lib/api';

vi.mock('@/lib/api', () => ({ default: { put: vi.fn().mockResolvedValue({}) } }));
function Appearance() {
  const theme = useTheme();
  return <><output>{theme.currentTheme}/{theme.colorMode}</output>
    <button onClick={() => theme.changeColorMode('dark')}>Escuro</button>
    <button onClick={() => theme.changeTheme('blue')}>Azul</button>
    <button onClick={() => theme.changeTheme('amber', { restore: true })}>Restaurar sessão</button>
    <button onClick={() => theme.changeTheme('purple', { restore: true })}>Restaurar cor pessoal</button>
  </>;
}

afterEach(() => {
  vi.clearAllMocks();
  document.documentElement.className = '';
  document.documentElement.removeAttribute('style');
});

describe('Cash appearance', () => {
  it('starts the redesign in light/petrol without posting legacy preferences during authentication', async () => {
    localStorage.setItem('selected-theme', 'amber'); localStorage.setItem('color-mode', 'dark');
    render(<ThemeProvider><Appearance /></ThemeProvider>);
    expect(screen.getByText('petrol/light')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Restaurar sessão'));
    expect(screen.getByText('petrol/light')).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
    expect(document.documentElement).toHaveClass('theme-light');
  });

  it('persists explicit choices and restores them after remount and session restoration', async () => {
    const first = render(<ThemeProvider><Appearance /></ThemeProvider>);
    fireEvent.click(screen.getByText('Azul')); fireEvent.click(screen.getByText('Escuro'));
    expect(localStorage.getItem(CASH_THEME_KEY)).toBe('blue');
    expect(localStorage.getItem(CASH_MODE_KEY)).toBe('dark');
    expect(api.put).toHaveBeenCalledExactlyOnceWith('/preferences/color-scheme', { colorScheme: 'blue' });
    first.unmount();
    render(<ThemeProvider><Appearance /></ThemeProvider>);
    await waitFor(() => expect(screen.getByText('blue/dark')).toBeInTheDocument());
    fireEvent.click(screen.getByText('Restaurar sessão'));
    expect(screen.getByText('blue/dark')).toBeInTheDocument();
    expect(api.put).toHaveBeenCalledTimes(1);
    expect(document.documentElement).toHaveClass('theme-dark');
  });

  it('preserves a custom account color on a browser without an appearance choice', () => {
    render(<ThemeProvider><Appearance /></ThemeProvider>);
    fireEvent.click(screen.getByText('Restaurar cor pessoal'));
    expect(screen.getByText('purple/light')).toBeInTheDocument();
    expect(api.put).not.toHaveBeenCalled();
  });
});
