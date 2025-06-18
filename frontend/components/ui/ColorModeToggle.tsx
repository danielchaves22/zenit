import React from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { Sun, Moon } from 'lucide-react';

export function ColorModeToggle() {
  const { colorMode, changeColorMode } = useTheme();
  const isLight = colorMode === 'light';

  const handleToggle = () => {
    changeColorMode(isLight ? 'dark' : 'light');
  };

  return (
    <button
      onClick={handleToggle}
      className="relative w-10 h-5 bg-surface border border-gray-700 rounded-full focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50"
      aria-label="Alternar modo claro ou escuro"
      title={isLight ? 'Modo escuro' : 'Modo claro'}
    >
      <div
        className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-accent transition-transform ${isLight ? 'translate-x-5' : ''}`}
      />
      <Sun size={12} className="absolute left-1 text-yellow-300" />
      <Moon size={12} className="absolute right-1 text-gray-300" />
    </button>
  );
}

