// frontend/contexts/ThemeContext.tsx - SISTEMA DE TEMAS DINÂMICOS COMPLETO
import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryDark: string;
  gradient: string;
  shadow: string;
}

export interface Theme {
  key: string;
  label: string;
  category: 'standard' | 'vibrant' | 'professional' | 'seasonal';
  accessibility: 'high' | 'medium' | 'low';
  colors: ThemeColors;
}

interface ThemeContextData {
  currentTheme: string;
  availableThemes: Theme[];
  themesByCategory: Record<string, Theme[]>;
  changeTheme: (themeKey: string) => void;
  getThemeInfo: (themeKey: string) => Theme;
}

const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

// ✅ DEFINIÇÃO DE TODOS OS TEMAS DISPONÍVEIS
const themes: Theme[] = [
  // STANDARD THEMES
  {
    key: 'amber',
    label: 'Âmbar Clássico',
    category: 'standard',
    accessibility: 'high',
    colors: {
      primary: '#f59e0b',
      primaryHover: '#e08c07',
      primaryLight: '#fbbf24',
      primaryDark: '#d97706',
      gradient: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)',
      shadow: '0 10px 25px rgba(245, 158, 11, 0.3)'
    }
  },
  {
    key: 'blue',
    label: 'Azul Corporativo',
    category: 'standard',
    accessibility: 'high',
    colors: {
      primary: '#3b82f6',
      primaryHover: '#2563eb',
      primaryLight: '#60a5fa',
      primaryDark: '#1d4ed8',
      gradient: 'linear-gradient(135deg, #3b82f6 0%, #1d4ed8 100%)',
      shadow: '0 10px 25px rgba(59, 130, 246, 0.3)'
    }
  },
  {
    key: 'green',
    label: 'Verde Natureza',
    category: 'standard',
    accessibility: 'high',
    colors: {
      primary: '#10b981',
      primaryHover: '#059669',
      primaryLight: '#34d399',
      primaryDark: '#047857',
      gradient: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
      shadow: '0 10px 25px rgba(16, 185, 129, 0.3)'
    }
  },

  // VIBRANT THEMES
  {
    key: 'purple',
    label: 'Roxo Vibrante',
    category: 'vibrant',
    accessibility: 'medium',
    colors: {
      primary: '#8b5cf6',
      primaryHover: '#7c3aed',
      primaryLight: '#a78bfa',
      primaryDark: '#6d28d9',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
      shadow: '0 10px 25px rgba(139, 92, 246, 0.3)'
    }
  },
  {
    key: 'pink',
    label: 'Rosa Moderno',
    category: 'vibrant',
    accessibility: 'medium',
    colors: {
      primary: '#ec4899',
      primaryHover: '#db2777',
      primaryLight: '#f472b6',
      primaryDark: '#be185d',
      gradient: 'linear-gradient(135deg, #ec4899 0%, #be185d 100%)',
      shadow: '0 10px 25px rgba(236, 72, 153, 0.3)'
    }
  },
  {
    key: 'orange',
    label: 'Laranja Energético',
    category: 'vibrant',
    accessibility: 'medium',
    colors: {
      primary: '#f97316',
      primaryHover: '#ea580c',
      primaryLight: '#fb923c',
      primaryDark: '#c2410c',
      gradient: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)',
      shadow: '0 10px 25px rgba(249, 115, 22, 0.3)'
    }
  },

  // PROFESSIONAL THEMES
  {
    key: 'slate',
    label: 'Cinza Profissional',
    category: 'professional',
    accessibility: 'high',
    colors: {
      primary: '#475569',
      primaryHover: '#334155',
      primaryLight: '#64748b',
      primaryDark: '#1e293b',
      gradient: 'linear-gradient(135deg, #475569 0%, #1e293b 100%)',
      shadow: '0 10px 25px rgba(71, 85, 105, 0.3)'
    }
  },
  {
    key: 'indigo',
    label: 'Índigo Executivo',
    category: 'professional',
    accessibility: 'high',
    colors: {
      primary: '#6366f1',
      primaryHover: '#4f46e5',
      primaryLight: '#818cf8',
      primaryDark: '#3730a3',
      gradient: 'linear-gradient(135deg, #6366f1 0%, #3730a3 100%)',
      shadow: '0 10px 25px rgba(99, 102, 241, 0.3)'
    }
  },
  {
    key: 'teal',
    label: 'Turquesa Elegante',
    category: 'professional',
    accessibility: 'high',
    colors: {
      primary: '#14b8a6',
      primaryHover: '#0d9488',
      primaryLight: '#2dd4bf',
      primaryDark: '#0f766e',
      gradient: 'linear-gradient(135deg, #14b8a6 0%, #0f766e 100%)',
      shadow: '0 10px 25px rgba(20, 184, 166, 0.3)'
    }
  },

  // SEASONAL THEMES
  {
    key: 'red',
    label: 'Vermelho Festivo',
    category: 'seasonal',
    accessibility: 'medium',
    colors: {
      primary: '#ef4444',
      primaryHover: '#dc2626',
      primaryLight: '#f87171',
      primaryDark: '#b91c1c',
      gradient: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
      shadow: '0 10px 25px rgba(239, 68, 68, 0.3)'
    }
  },
  {
    key: 'emerald',
    label: 'Esmeralda Primavera',
    category: 'seasonal',
    accessibility: 'high',
    colors: {
      primary: '#059669',
      primaryHover: '#047857',
      primaryLight: '#10b981',
      primaryDark: '#065f46',
      gradient: 'linear-gradient(135deg, #059669 0%, #065f46 100%)',
      shadow: '0 10px 25px rgba(5, 150, 105, 0.3)'
    }
  },
  {
    key: 'yellow',
    label: 'Amarelo Verão',
    category: 'seasonal',
    accessibility: 'low',
    colors: {
      primary: '#eab308',
      primaryHover: '#ca8a04',
      primaryLight: '#facc15',
      primaryDark: '#a16207',
      gradient: 'linear-gradient(135deg, #eab308 0%, #a16207 100%)',
      shadow: '0 10px 25px rgba(234, 179, 8, 0.3)'
    }
  }
];

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [currentTheme, setCurrentTheme] = useState<string>('amber');

  // ✅ CARREGAR TEMA SALVO AO INICIALIZAR
  useEffect(() => {
    const savedTheme = localStorage.getItem('zenit_theme');
    if (savedTheme && themes.find(t => t.key === savedTheme)) {
      setCurrentTheme(savedTheme);
      applyTheme(savedTheme);
    } else {
      // Aplicar tema padrão
      applyTheme('amber');
    }
  }, []);

  // ✅ FUNÇÃO PARA APLICAR TEMA NO CSS
  const applyTheme = (themeKey: string) => {
    const theme = themes.find(t => t.key === themeKey);
    if (!theme) return;

    const root = document.documentElement;
    
    // Aplicar variáveis CSS
    root.style.setProperty('--color-primary', theme.colors.primary);
    root.style.setProperty('--color-primary-hover', theme.colors.primaryHover);
    root.style.setProperty('--color-primary-light', theme.colors.primaryLight);
    root.style.setProperty('--color-primary-dark', theme.colors.primaryDark);
    root.style.setProperty('--color-primary-gradient', theme.colors.gradient);
    root.style.setProperty('--color-primary-shadow', theme.colors.shadow);
  };

  // ✅ FUNÇÃO PARA MUDAR TEMA
  const changeTheme = (themeKey: string) => {
    const theme = themes.find(t => t.key === themeKey);
    if (!theme) return;

    setCurrentTheme(themeKey);
    applyTheme(themeKey);
    
    // Salvar no localStorage
    localStorage.setItem('zenit_theme', themeKey);
  };

  // ✅ FUNÇÃO PARA OBTER INFORMAÇÕES DO TEMA
  const getThemeInfo = (themeKey: string): Theme => {
    return themes.find(t => t.key === themeKey) || themes[0];
  };

  // ✅ AGRUPAR TEMAS POR CATEGORIA
  const themesByCategory = themes.reduce((acc, theme) => {
    if (!acc[theme.category]) {
      acc[theme.category] = [];
    }
    acc[theme.category].push(theme);
    return acc;
  }, {} as Record<string, Theme[]>);

  const value: ThemeContextData = {
    currentTheme,
    availableThemes: themes,
    themesByCategory,
    changeTheme,
    getThemeInfo
  };

  return (
    <ThemeContext.Provider value={value}>
      {children}
    </ThemeContext.Provider>
  );
}

// ✅ HOOK PARA USAR O TEMA
export function useTheme() {
  const context = useContext(ThemeContext);
  
  if (!context) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  
  return context;
}