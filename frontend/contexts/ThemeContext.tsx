// frontend/contexts/ThemeContext.tsx - VERSÃO EXPANDIDA

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

export type ThemeColor = 
  | 'amber' | 'blue' | 'purple' | 'green' | 'red' | 'indigo' | 'pink'
  | 'orange' | 'teal' | 'cyan' | 'emerald' | 'violet' | 'slate' | 'lime'
  | 'rose' | 'sky' | 'yellow' | 'fuchsia' | 'neutral';

export interface ThemeColors {
  primary: string;
  primaryHover: string;
  primaryLight: string;
  primaryDark: string;
  gradient?: string; // ✅ NOVO: Para gradientes
  shadow?: string;   // ✅ NOVO: Para sombras coloridas
}

export interface ThemeInfo {
  key: ThemeColor;
  label: string;
  colors: ThemeColors;
  category: 'standard' | 'vibrant' | 'professional' | 'seasonal'; // ✅ NOVO: Categorias
  accessibility: 'high' | 'medium' | 'low'; // ✅ NOVO: Nível de acessibilidade
}

// ✅ CONFIGURAÇÃO EXPANDIDA COM CATEGORIAS
const themeConfig: Record<ThemeColor, Omit<ThemeInfo, 'key'>> = {
  // === TEMAS PADRÃO ===
  amber: {
    label: 'Âmbar',
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
  
  blue: {
    label: 'Azul',
    category: 'professional',
    accessibility: 'high',
    colors: {
      primary: '#015dff',
      primaryHover: '#0147cc',
      primaryLight: '#3b82f6',
      primaryDark: '#1e40af',
      gradient: 'linear-gradient(135deg, #015dff 0%, #1e40af 100%)',
      shadow: '0 10px 25px rgba(1, 93, 255, 0.3)'
    }
  },
  
  // === TEMAS VIBRANTES ===
  purple: {
    label: 'Roxo',
    category: 'vibrant',
    accessibility: 'high',
    colors: {
      primary: '#8b5cf6',
      primaryHover: '#7c3aed',
      primaryLight: '#a78bfa',
      primaryDark: '#6d28d9',
      gradient: 'linear-gradient(135deg, #8b5cf6 0%, #6d28d9 100%)',
      shadow: '0 10px 25px rgba(139, 92, 246, 0.3)'
    }
  },
  
  green: {
    label: 'Verde',
    category: 'vibrant',
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
  
  // === NOVOS TEMAS ===
  orange: {
    label: 'Laranja',
    category: 'vibrant',
    accessibility: 'high',
    colors: {
      primary: '#f97316',
      primaryHover: '#ea580c',
      primaryLight: '#fb923c',
      primaryDark: '#c2410c',
      gradient: 'linear-gradient(135deg, #f97316 0%, #c2410c 100%)',
      shadow: '0 10px 25px rgba(249, 115, 22, 0.3)'
    }
  },
  
  teal: {
    label: 'Azul Petróleo',
    category: 'professional',
    accessibility: 'high',
    colors: {
      primary: '#14b8a6',
      primaryHover: '#0f766e',
      primaryLight: '#5eead4',
      primaryDark: '#134e4a',
      gradient: 'linear-gradient(135deg, #14b8a6 0%, #134e4a 100%)',
      shadow: '0 10px 25px rgba(20, 184, 166, 0.3)'
    }
  },
  
  cyan: {
    label: 'Ciano',
    category: 'vibrant',
    accessibility: 'medium',
    colors: {
      primary: '#06b6d4',
      primaryHover: '#0891b2',
      primaryLight: '#67e8f9',
      primaryDark: '#164e63',
      gradient: 'linear-gradient(135deg, #06b6d4 0%, #164e63 100%)',
      shadow: '0 10px 25px rgba(6, 182, 212, 0.3)'
    }
  },
  
  rose: {
    label: 'Rosa',
    category: 'vibrant',
    accessibility: 'high',
    colors: {
      primary: '#f43f5e',
      primaryHover: '#e11d48',
      primaryLight: '#fb7185',
      primaryDark: '#be123c',
      gradient: 'linear-gradient(135deg, #f43f5e 0%, #be123c 100%)',
      shadow: '0 10px 25px rgba(244, 63, 94, 0.3)'
    }
  },
  
  // === TEMAS PROFISSIONAIS ===
  slate: {
    label: 'Ardósia',
    category: 'professional',
    accessibility: 'high',
    colors: {
      primary: '#64748b',
      primaryHover: '#475569',
      primaryLight: '#94a3b8',
      primaryDark: '#334155',
      gradient: 'linear-gradient(135deg, #64748b 0%, #334155 100%)',
      shadow: '0 10px 25px rgba(100, 116, 139, 0.3)'
    }
  },
  
  neutral: {
    label: 'Neutro',
    category: 'professional',
    accessibility: 'high',
    colors: {
      primary: '#6b7280',
      primaryHover: '#4b5563',
      primaryLight: '#9ca3af',
      primaryDark: '#374151',
      gradient: 'linear-gradient(135deg, #6b7280 0%, #374151 100%)',
      shadow: '0 10px 25px rgba(107, 114, 128, 0.3)'
    }
  },
  
  // === OUTROS TEMAS ===
  red: {
    label: 'Vermelho',
    category: 'vibrant',
    accessibility: 'high',
    colors: {
      primary: '#ef4444',
      primaryHover: '#dc2626',
      primaryLight: '#f87171',
      primaryDark: '#b91c1c',
      gradient: 'linear-gradient(135deg, #ef4444 0%, #b91c1c 100%)',
      shadow: '0 10px 25px rgba(239, 68, 68, 0.3)'
    }
  },
  
  indigo: {
    label: 'Índigo',
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
  
  pink: {
    label: 'Rosa',
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
  
  emerald: {
    label: 'Esmeralda',
    category: 'vibrant',
    accessibility: 'high',
    colors: {
      primary: '#059669',
      primaryHover: '#047857',
      primaryLight: '#6ee7b7',
      primaryDark: '#064e3b',
      gradient: 'linear-gradient(135deg, #059669 0%, #064e3b 100%)',
      shadow: '0 10px 25px rgba(5, 150, 105, 0.3)'
    }
  },
  
  violet: {
    label: 'Violeta',
    category: 'vibrant',
    accessibility: 'high',
    colors: {
      primary: '#7c3aed',
      primaryHover: '#6d28d9',
      primaryLight: '#a78bfa',
      primaryDark: '#4c1d95',
      gradient: 'linear-gradient(135deg, #7c3aed 0%, #4c1d95 100%)',
      shadow: '0 10px 25px rgba(124, 58, 237, 0.3)'
    }
  },
  
  lime: {
    label: 'Lima',
    category: 'vibrant',
    accessibility: 'medium',
    colors: {
      primary: '#65a30d',
      primaryHover: '#4d7c0f',
      primaryLight: '#a3e635',
      primaryDark: '#365314',
      gradient: 'linear-gradient(135deg, #65a30d 0%, #365314 100%)',
      shadow: '0 10px 25px rgba(101, 163, 13, 0.3)'
    }
  },
  
  sky: {
    label: 'Céu',
    category: 'professional',
    accessibility: 'medium',
    colors: {
      primary: '#0ea5e9',
      primaryHover: '#0284c7',
      primaryLight: '#38bdf8',
      primaryDark: '#075985',
      gradient: 'linear-gradient(135deg, #0ea5e9 0%, #075985 100%)',
      shadow: '0 10px 25px rgba(14, 165, 233, 0.3)'
    }
  },
  
  yellow: {
    label: 'Amarelo',
    category: 'vibrant',
    accessibility: 'low', // ⚠️ Amarelo tem baixo contraste
    colors: {
      primary: '#eab308',
      primaryHover: '#ca8a04',
      primaryLight: '#facc15',
      primaryDark: '#a16207',
      gradient: 'linear-gradient(135deg, #eab308 0%, #a16207 100%)',
      shadow: '0 10px 25px rgba(234, 179, 8, 0.3)'
    }
  },
  
  fuchsia: {
    label: 'Fúcsia',
    category: 'vibrant',
    accessibility: 'high',
    colors: {
      primary: '#d946ef',
      primaryHover: '#c026d3',
      primaryLight: '#e879f9',
      primaryDark: '#a21caf',
      gradient: 'linear-gradient(135deg, #d946ef 0%, #a21caf 100%)',
      shadow: '0 10px 25px rgba(217, 70, 239, 0.3)'
    }
  }
};

interface ThemeContextData {
  currentTheme: ThemeColor;
  colors: ThemeColors;
  changeTheme: (theme: ThemeColor) => void;
  availableThemes: ThemeInfo[];
  themesByCategory: Record<string, ThemeInfo[]>; // ✅ NOVO: Temas agrupados por categoria
  getCSSVariable: (property: keyof ThemeColors) => string;
  getThemeInfo: (theme: ThemeColor) => ThemeInfo; // ✅ NOVO: Obter info completa do tema
}

const ThemeContext = createContext<ThemeContextData>({} as ThemeContextData);

interface ThemeProviderProps {
  children: ReactNode;
}

export function ThemeProvider({ children }: ThemeProviderProps) {
  const [currentTheme, setCurrentTheme] = useState<ThemeColor>('amber');

  // Carregar tema salvo no localStorage
  useEffect(() => {
    const savedTheme = localStorage.getItem('zenit_theme') as ThemeColor;
    if (savedTheme && themeConfig[savedTheme]) {
      setCurrentTheme(savedTheme);
    }
  }, []);

  // Atualizar CSS variables quando o tema mudar
  useEffect(() => {
    const colors = themeConfig[currentTheme].colors;
    const root = document.documentElement;
    
    // CSS Variables básicas
    root.style.setProperty('--color-primary', colors.primary);
    root.style.setProperty('--color-primary-hover', colors.primaryHover);
    root.style.setProperty('--color-primary-light', colors.primaryLight);
    root.style.setProperty('--color-primary-dark', colors.primaryDark);
    
    // ✅ NOVAS CSS Variables
    if (colors.gradient) {
      root.style.setProperty('--color-primary-gradient', colors.gradient);
    }
    if (colors.shadow) {
      root.style.setProperty('--color-primary-shadow', colors.shadow);
    }
    
    // Salvar no localStorage
    localStorage.setItem('zenit_theme', currentTheme);
  }, [currentTheme]);

  const changeTheme = (theme: ThemeColor) => {
    setCurrentTheme(theme);
  };

  const getCSSVariable = (property: keyof ThemeColors) => {
    return `var(--color-${property.replace(/([A-Z])/g, '-$1').toLowerCase()})`;
  };

  const getThemeInfo = (theme: ThemeColor): ThemeInfo => {
    return {
      key: theme,
      ...themeConfig[theme]
    };
  };

  // ✅ GERAR LISTA DE TEMAS DISPONÍVEIS
  const availableThemes: ThemeInfo[] = Object.entries(themeConfig).map(([key, config]) => ({
    key: key as ThemeColor,
    ...config
  }));

  // ✅ AGRUPAR TEMAS POR CATEGORIA
  const themesByCategory = availableThemes.reduce((acc, theme) => {
    if (!acc[theme.category]) {
      acc[theme.category] = [];
    }
    acc[theme.category].push(theme);
    return acc;
  }, {} as Record<string, ThemeInfo[]>);

  const contextValue: ThemeContextData = {
    currentTheme,
    colors: themeConfig[currentTheme].colors,
    changeTheme,
    availableThemes,
    themesByCategory,
    getCSSVariable,
    getThemeInfo
  };

  return (
    <ThemeContext.Provider value={contextValue}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  
  if (!context) {
    throw new Error('useTheme deve ser usado dentro de um ThemeProvider');
  }
  
  return context;
}