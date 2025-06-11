// frontend/components/layout/DashboardLayout.tsx - COM CORES DINÂMICAS
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { ThemeSelector } from '@/components/ui/ThemeSelector';
import { User } from 'lucide-react';
import { RoleBasedItem } from '@/components/navigation/RoleBasedNavigation';
import { 
  Building2, 
  Users, 
  DollarSign, 
  BarChart3, 
  Settings,
  Home
} from 'lucide-react';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function DashboardLayout({ children, title = 'Dashboard' }: DashboardLayoutProps) {
  const { logout, userName, companyName, userRole } = useAuth();
  const router = useRouter();
  
  // Estado para controlar a visibilidade do menu do usuário
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  
  // Obtém o estado salvo no localStorage ou usa o padrão
  const getSavedCollapsedState = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebarCollapsed');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  };
  
  const [sidebarCollapsed, setSidebarCollapsed] = useState(getSavedCollapsedState);

  // Esta função será passada para o Sidebar para atualizar o estado aqui
  const handleSidebarToggle = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebarCollapsed', JSON.stringify(collapsed));
    }
  };

  // Efeito para detectar cliques fora do menu do usuário
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };

    // Adiciona o listener quando o menu está aberto
    if (userMenuOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    // Cleanup
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [userMenuOpen]);

  // Função para alternar o menu do usuário
  const toggleUserMenu = () => {
    setUserMenuOpen(!userMenuOpen);
  };

  // Função para fechar o menu e executar ação
  const handleMenuAction = (action: () => void) => {
    setUserMenuOpen(false);
    action();
  };

  return (
    <div className="flex flex-col h-screen bg-[#1e2126]">
      {/* Top Navigation com uma borda sutil */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-[#151921] text-white py-3 px-6 flex justify-between items-center h-[60px] border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <Link href="/" className="flex items-center hover:opacity-90">
            <Image
              src="/assets/images/logo_principal.png"
              alt="ZENIT"
              width={2000}
              height={1000}
              priority
              className="h-10 w-auto"
            />
          </Link>
          <span className="text-white text-lg font-bold font-heading">
            {companyName}
          </span>
        </div>

        <div className="flex items-center space-x-3">
          {/* ✅ SELETOR DE TEMAS (oculto) */}
          <div className="hidden">
            <ThemeSelector showLabel={false} size="sm" />
          </div>
          <span className="text-sm text-gray-300">{userName}</span>
          
          <div className="relative" ref={userMenuRef}>
            <button 
              onClick={toggleUserMenu}
              className="flex items-center space-x-1 focus:outline-none"
            >
              {/* ✅ AVATAR COM COR DINÂMICA */}
              <div className="bg-accent rounded-full p-1 transition-colors duration-200">
                <User size={18} className="text-white" />
              </div>
            </button>
            
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-[#1e2126] shadow-lg rounded-md z-10 border border-gray-700 animate-fadeIn">
                <div className="p-3 border-b border-gray-700">
                  <p className="font-medium text-white">{userName}</p>
                  <p className="text-sm text-gray-400">{companyName}</p>
                  {/* ✅ ROLE BADGE COM COR DINÂMICA */}
                  <p className="text-xs text-accent">{userRole}</p>
                </div>
                <div className="p-2">
                  <button 
                    onClick={() => handleMenuAction(() => router.push('/profile'))}
                    className="w-full text-left px-3 py-2 text-sm hover:bg-[#262b36] rounded text-gray-300"
                  >
                    Meu Perfil
                  </button>
                  <button 
                    onClick={() => handleMenuAction(logout)}
                    className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-[#262b36] rounded"
                  >
                    Sair
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content with Sidebar - Abaixo da barra de navegação fixa */}
      <div className="flex h-full pt-[60px]"> {/* Padding top para compensar a altura da navbar fixa */}
        <Sidebar onToggle={handleSidebarToggle} isCollapsed={sidebarCollapsed} />
        
        {/* Conteúdo principal com margem esquerda para não ficar escondido pelo sidebar */}
        <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
          sidebarCollapsed ? 'ml-16' : 'ml-52'
        }`}>
          {/* Page Content */}
          <main className="flex-1 overflow-y-auto p-6 bg-[#1e2126] text-gray-300">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}