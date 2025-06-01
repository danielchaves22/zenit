// frontend/contexts/ThemeContext.tsx - VERSÃO COMPLETA
import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

// ✅ DEFINIÇÕES DE TEMA
export interface Theme {
  key: string;
  label: string;
  category: 'standard' | 'vibrant' | 'professional' | 'seasonal';
  accessibility: 'high' | 'medium' | 'low';
  colors: {
    primary: string;
    primaryHover: string;
    primaryLight: string;
    primaryDark: string;
    primaryGradient: string;
    primaryShadow: string;
  };
}

// ✅ CATÁLOGO COMPLETO DE TEMAS
export const AVAILABLE_THEMES: Theme[] = [
  // Standard
  {
    key: 'amber',
    label: 'Âmbar',
    category: 'standard',
    accessibility: 'high',
    colors: {
      primary: '#f59e0b',
      primaryHover: '#e08c07',
      primaryLight: '#fbbf24',
      primaryDark: '#d97706',
      primaryGradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      primaryShadow: '0 10px 25px rgba(245, 158, 11, 0.3)',
    }
  },
  {
    key: 'blue',
    label: 'Azul',
    category: 'standard',
    accessibility: 'high',
    colors: {
      primary: '#2563eb',
      primaryHover: '#1d4ed8',
      primaryLight: '#3b82f6',
      primaryDark: '#1e40af',
      primaryGradient: 'linear-gradient(135deg, #2563eb 0%, #1e40af 100%)',
      primaryShadow: '0 10px 25px rgba(37, 99, 235, 0.3)',
    }
  },
  {
    key: 'emerald',
    label: 'Esmeralda',
    category: 'standard',
    accessibility: 'high',
    colors: {
      primary: '#059669',
      primaryHover: '#047857',
      primaryLight: '#10b981',
      primaryDark: '#065f46',
      primaryGradient: 'linear-gradient(135deg, #059669 0%, #065f46 100%)',
      primaryShadow: '0 10px 25px rgba(5, 150, 105, 0.3)',
    }
  },
  {
    key: 'purple',
    label: 'Roxo',
    category: 'standard',
    accessibility: 'high',
    colors: {
      primary: '#7c3aed',
      primaryHover: '#6d28d9',
      primaryLight: '#8b5cf6',
      primaryDark: '#5b21b6',
      primaryGradient: 'linear-gradient(135deg, #7c3aed 0%, #5b21b6 100%)',
      primaryShadow: '0 10px 25px rgba(124, 58, 237, 0.3)',
    }
  },

  // Vibrant
  {
    key: 'orange',
    label: 'Laranja Vibrante',
    category: 'vibrant',
    accessibility: 'medium',
    colors: {
      primary: '#ea580c',
      primaryHover: '#dc2626',
      primaryLight: '#f97316',
      primaryDark: '#c2410c',
      primaryGradient: 'linear-gradient(135deg, #ea580c 0%, #c2410c 100%)',
      primaryShadow: '0 10px 25px rgba(234, 88, 12, 0.4)',
    }
  },
  {
    key: 'pink',
    label: 'Rosa Vibrante',
    category: 'vibrant',
    accessibility: 'medium',
    colors: {
      primary: '#e11d48',
      primaryHover: '#be123c',
      primaryLight: '#f43f5e',
      primaryDark: '#9f1239',
      primaryGradient: 'linear-gradient(135deg, #e11d48 0%, #9f1239 100%)',
      primaryShadow: '0 10px 25px rgba(225, 29, 72, 0.4)',
    }
  },
  {
    key: 'cyan',
    label: 'Ciano Vibrante',
    category: 'vibrant',
    accessibility: 'medium',
    colors: {
      primary: '#0891b2',
      primaryHover: '#0e7490',
      primaryLight: '#06b6d4',
      primaryDark: '#164e63',
      primaryGradient: 'linear-gradient(135deg, #0891b2 0%, #164e63 100%)',
      primaryShadow: '0 10px 25px rgba(8, 145, 178, 0.4)',
    }
  },

  // Professional
  {
    key: 'slate',
    label: 'Ardósia Profissional',
    category: 'professional',
    accessibility: 'high',
    colors: {
      primary: '#475569',
      primaryHover: '#334155',
      primaryLight: '#64748b',
      primaryDark: '#1e293b',
      primaryGradient: 'linear-gradient(135deg, #475569 0%, #1e293b 100%)',
      primaryShadow: '0 10px 25px rgba(71, 85, 105, 0.3)',
    }
  },
  {
    key: 'gray',
    label: 'Cinza Corporativo',
    category: 'professional',
    accessibility: 'high',
    colors: {
      primary: '#6b7280',
      primaryHover: '#4b5563',
      primaryLight: '#9ca3af',
      primaryDark: '#374151',
      primaryGradient: 'linear-gradient(135deg, #6b7280 0%, #374151 100%)',
      primaryShadow: '0 10px 25px rgba(107, 114, 128, 0.3)',
    }
  },
  {
    key: 'indigo',
    label: 'Índigo Executivo',
    category: 'professional',
    accessibility: 'high',
    colors: {
      primary: '#4338ca',
      primaryHover: '#3730a3',
      primaryLight: '#6366f1',
      primaryDark: '#312e81',
      primaryGradient: 'linear-gradient(135deg, #4338ca 0%, #312e81 100%)',
      primaryShadow: '0 10px 25px rgba(67, 56, 202, 0.3)',
    }
  },

  // Seasonal
  {
    key: 'christmas',
    label: 'Natal',
    category: 'seasonal',
    accessibility: 'medium',
    colors: {
      primary: '#dc2626',
      primaryHover: '#b91c1c',
      primaryLight: '#ef4444',
      primaryDark: '#991b1b',
      primaryGradient: 'linear-gradient(135deg, #dc2626 0%, #991b1b 100%)',
      primaryShadow: '0 10px 25px rgba(220, 38, 38, 0.4)',
    }
  },
  {
    key: 'summer',
    label: 'Verão',
    category: 'seasonal',
    accessibility: 'medium',
    colors: {
      primary: '#f59e0b',
      primaryHover: '#d97706',
      primaryLight: '#fbbf24',
      primaryDark: '#92400e',
      primaryGradient: 'linear-gradient(135deg, #f59e0b 0%, #92400e 100%)',
      primaryShadow: '0 10px 25px rgba(245, 158, 11, 0.4)',
    }
  }
];

// ✅ INTERFACE DO CONTEXTO
interface ThemeContextData {
  currentTheme: string;
  availableThemes: Theme[];
  themesByCategory: Record<string, Theme[]>;
  getThemeInfo: (themeKey: string) => Theme;
  changeTheme: (themeKey: string) => void;
}

// ✅ CRIAR CONTEXTO
const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

// ✅ PROVIDER DO CONTEXTO
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<string>('amber');

  // ✅ APLICAR TEMA NAS CSS VARIABLES
  const applyTheme = (theme: Theme) => {
    const root = document.documentElement;
    root.style.setProperty('--color-primary', theme.colors.primary);
    root.style.setProperty('--color-primary-hover', theme.colors.primaryHover);
    root.style.setProperty('--color-primary-light', theme.colors.primaryLight);
    root.style.setProperty('--color-primary-dark', theme.colors.primaryDark);
    root.style.setProperty('--color-primary-gradient', theme.colors.primaryGradient);
    root.style.setProperty('--color-primary-shadow', theme.colors.primaryShadow);
  };

  // ✅ CARREGAR TEMA SALVO E APLICAR
  useEffect(() => {
    const savedTheme = localStorage.getItem('selected-theme');
    if (savedTheme && AVAILABLE_THEMES.find(t => t.key === savedTheme)) {
      setCurrentTheme(savedTheme);
    }
  }, []);

  // ✅ APLICAR TEMA QUANDO MUDAR
  useEffect(() => {
    const theme = AVAILABLE_THEMES.find(t => t.key === currentTheme);
    if (theme) {
      applyTheme(theme);
    }
  }, [currentTheme]);

  // ✅ FUNÇÃO PARA MUDAR TEMA
  const changeTheme = (themeKey: string) => {
    const theme = AVAILABLE_THEMES.find(t => t.key === themeKey);
    if (theme) {
      setCurrentTheme(themeKey);
      localStorage.setItem('selected-theme', themeKey);
      applyTheme(theme);
    }
  };

  // ✅ AGRUPAR TEMAS POR CATEGORIA
  const themesByCategory = AVAILABLE_THEMES.reduce((acc, theme) => {
    if (!acc[theme.category]) {
      acc[theme.category] = [];
    }
    acc[theme.category].push(theme);
    return acc;
  }, {} as Record<string, Theme[]>);

  // ✅ OBTER INFO DO TEMA
  const getThemeInfo = (themeKey: string): Theme => {
    return AVAILABLE_THEMES.find(t => t.key === themeKey) || AVAILABLE_THEMES[0];
  };

  return (
    <ThemeContext.Provider value={{
      currentTheme,
      availableThemes: AVAILABLE_THEMES,
      themesByCategory,
      getThemeInfo,
      changeTheme
    }}>
      {children}
    </ThemeContext.Provider>
  );
}

// ✅ HOOK PARA USAR O CONTEXTO
export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
}