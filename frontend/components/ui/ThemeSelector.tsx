// frontend/components/ui/ThemeSelector.tsx - VERSÃO AVANÇADA COM CATEGORIAS

import React, { useState, useRef, useEffect } from 'react';
import { useTheme } from '@/contexts/ThemeContext';
import { Palette, Check, Zap, Briefcase, Star, Calendar } from 'lucide-react';

interface ThemeSelectorProps {
  showLabel?: boolean;
  size?: 'sm' | 'md' | 'lg';
  showCategories?: boolean; // ✅ NOVO: Mostrar categorias
  showAccessibility?: boolean; // ✅ NOVO: Mostrar nível de acessibilidade
}

export function ThemeSelector({ 
  showLabel = true, 
  size = 'md',
  showCategories = true,
  showAccessibility = false
}: ThemeSelectorProps) {
  const { currentTheme, changeTheme, themesByCategory, getThemeInfo } = useTheme();
  const [isOpen, setIsOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<string | null>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Fechar dropdown quando clicar fora
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setActiveCategory(null);
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  const sizes = {
    sm: {
      button: 'p-2',
      icon: 16,
      text: 'text-xs',
      dropdown: 'w-72'
    },
    md: {
      button: 'p-2.5',
      icon: 18,
      text: 'text-sm',
      dropdown: 'w-80'
    },
    lg: {
      button: 'p-3',
      icon: 20,
      text: 'text-base',
      dropdown: 'w-96'
    }
  };

  const currentSize = sizes[size];
  const currentThemeInfo = getThemeInfo(currentTheme);

  // ✅ ÍCONES PARA CATEGORIAS
  const categoryIcons = {
    standard: <Star size={14} className="text-yellow-400" />,
    vibrant: <Zap size={14} className="text-orange-400" />,
    professional: <Briefcase size={14} className="text-blue-400" />,
    seasonal: <Calendar size={14} className="text-green-400" />
  };

  const categoryLabels = {
    standard: 'Padrão',
    vibrant: 'Vibrante',
    professional: 'Profissional',
    seasonal: 'Sazonal'
  };

  // ✅ ÍCONES PARA ACESSIBILIDADE
  const accessibilityIcons = {
    high: '🟢',
    medium: '🟡', 
    low: '🔴'
  };

  const accessibilityLabels = {
    high: 'Alta acessibilidade',
    medium: 'Acessibilidade média',
    low: 'Baixa acessibilidade'
  };

  return (
    <div className="relative" ref={dropdownRef}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className={`${currentSize.button} bg-[#1e2126] border border-gray-700 rounded-lg hover:bg-[#262b36] transition-all duration-200 flex items-center gap-2 focus:outline-none focus:ring-2 focus:ring-accent focus:ring-opacity-50 hover-lift`}
        style={{ 
          borderColor: isOpen ? currentThemeInfo.colors.primary : undefined,
          boxShadow: isOpen ? `0 0 0 1px ${currentThemeInfo.colors.primary}` : undefined
        }}
        title="Alterar tema de cores"
      >
        <div 
          className="w-4 h-4 rounded-full border-2 border-white shadow-sm"
          style={{ backgroundColor: currentThemeInfo.colors.primary }}
        />
        <Palette size={currentSize.icon} className="text-gray-300" />
        {showLabel && (
          <span className={`${currentSize.text} text-gray-300 hidden sm:inline`}>
            Tema
          </span>
        )}
      </button>

      {isOpen && (
        <div className={`absolute right-0 mt-2 ${currentSize.dropdown} bg-[#1e2126] border border-gray-700 rounded-lg shadow-2xl z-50 animate-fadeIn max-h-96 overflow-y-auto`}>
          {/* Header */}
          <div className="px-4 py-3 border-b border-gray-700">
            <h3 className={`${currentSize.text} font-medium text-white`}>Escolher Tema</h3>
            <p className="text-xs text-gray-400">Personalize as cores da interface</p>
          </div>
          
          {/* Categorias */}
          {showCategories ? (
            <div className="py-2">
              {Object.entries(themesByCategory).map(([category, themes]) => (
                <div key={category}>
                  {/* Cabeçalho da Categoria */}
                  <div 
                    className="px-4 py-2 flex items-center gap-2 hover:bg-[#262b36] cursor-pointer transition-colors"
                    onClick={() => setActiveCategory(activeCategory === category ? null : category)}
                  >
                    {categoryIcons[category as keyof typeof categoryIcons]}
                    <span className="text-sm font-medium text-gray-300">
                      {categoryLabels[category as keyof typeof categoryLabels]}
                    </span>
                    <span className="text-xs text-gray-500 ml-auto">
                      {themes.length} tema{themes.length !== 1 ? 's' : ''}
                    </span>
                  </div>

                  {/* Temas da Categoria */}
                  {(activeCategory === category || activeCategory === null) && (
                    <div className="pl-4">
                      {themes.map((theme) => (
                        <button
                          key={theme.key}
                          onClick={() => {
                            changeTheme(theme.key);
                            setIsOpen(false);
                          }}
                          className={`w-full px-3 py-2.5 flex items-center gap-3 hover:bg-[#262b36] transition-colors ${
                            currentTheme === theme.key ? 'bg-[#262b36] border-l-2' : ''
                          }`}
                          style={{
                            borderLeftColor: currentTheme === theme.key ? theme.colors.primary : undefined
                          }}
                        >
                          <div className="flex items-center gap-2 flex-1">
                            {/* Cor do Tema */}
                            <div className="relative">
                              <div 
                                className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                                style={{ backgroundColor: theme.colors.primary }}
                              />
                              {/* Indicador de Acessibilidade */}
                              {showAccessibility && (
                                <div 
                                  className="absolute -top-1 -right-1 w-3 h-3 rounded-full border border-gray-600 flex items-center justify-center text-xs"
                                  title={accessibilityLabels[theme.accessibility]}
                                >
                                  <span className="text-xs leading-none">
                                    {accessibilityIcons[theme.accessibility]}
                                  </span>
                                </div>
                              )}
                            </div>
                            
                            {/* Info do Tema */}
                            <div className="flex flex-col items-start">
                              <span className={`${currentSize.text} text-white font-medium`}>
                                {theme.label}
                              </span>
                              <div className="flex items-center gap-2">
                                <span className="text-xs text-gray-400">
                                  {theme.colors.primary}
                                </span>
                                {showAccessibility && (
                                  <span className="text-xs text-gray-500">
                                    • {accessibilityLabels[theme.accessibility]}
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          
                          {/* Check do Tema Ativo */}
                          {currentTheme === theme.key && (
                            <Check size={16} style={{ color: theme.colors.primary }} />
                          )}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            /* Modo Simples - Sem Categorias */
            <div className="py-1">
              {Object.values(themesByCategory).flat().map((theme) => (
                <button
                  key={theme.key}
                  onClick={() => {
                    changeTheme(theme.key);
                    setIsOpen(false);
                  }}
                  className={`w-full px-4 py-2.5 flex items-center gap-3 hover:bg-[#262b36] transition-colors ${
                    currentTheme === theme.key ? 'bg-[#262b36]' : ''
                  }`}
                >
                  <div className="flex items-center gap-2 flex-1">
                    <div 
                      className="w-5 h-5 rounded-full border-2 border-white shadow-sm"
                      style={{ backgroundColor: theme.colors.primary }}
                    />
                    <div className="flex flex-col items-start">
                      <span className={`${currentSize.text} text-white font-medium`}>
                        {theme.label}
                      </span>
                      <span className="text-xs text-gray-400">
                        {theme.colors.primary}
                      </span>
                    </div>
                  </div>
                  
                  {currentTheme === theme.key && (
                    <Check size={16} style={{ color: theme.colors.primary }} />
                  )}
                </button>
              ))}
            </div>
          )}

          {/* Footer */}
          <div className="px-4 py-3 border-t border-gray-700 bg-[#151921]">
            <div className="flex items-center justify-between">
              <p className="text-xs text-gray-500">
                Preferência salva automaticamente
              </p>
              {showAccessibility && (
                <div className="flex items-center gap-1 text-xs text-gray-500">
                  <span>🟢 Alta</span>
                  <span>🟡 Média</span>
                  <span>🔴 Baixa</span>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}