// frontend/components/layout/DashboardLayout.tsx - Atualizado: header com empresa centralizada
import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/router';
import Image from 'next/image';
import Link from 'next/link';
import { useAuth } from '@/contexts/AuthContext';
import { Sidebar } from './Sidebar';
import { ThemeSelector } from '@/components/ui/ThemeSelector';
import { User, Repeat } from 'lucide-react';
import { CompanySwitcherModal } from '@/components/ui/CompanySwitcherModal';

interface DashboardLayoutProps {
  children: React.ReactNode;
  title?: string;
}

export function DashboardLayout({ children, title = 'Dashboard' }: DashboardLayoutProps) {
  const { logout, userName, companyName, userRole, user } = useAuth();
  const router = useRouter();

  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);
  const [companyModalOpen, setCompanyModalOpen] = useState(false);
  const canSwitchCompany = !!(user?.companies && user.companies.length > 1);

  const getSavedCollapsedState = () => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('sidebarCollapsed');
      return saved ? JSON.parse(saved) : false;
    }
    return false;
  };

  const [sidebarCollapsed, setSidebarCollapsed] = useState(getSavedCollapsedState);

  const handleSidebarToggle = (collapsed: boolean) => {
    setSidebarCollapsed(collapsed);
    if (typeof window !== 'undefined') {
      localStorage.setItem('sidebarCollapsed', JSON.stringify(collapsed));
    }
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setUserMenuOpen(false);
      }
    };
    if (userMenuOpen) document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [userMenuOpen]);

  const toggleUserMenu = () => setUserMenuOpen(!userMenuOpen);
  const handleMenuAction = (action: () => void) => { setUserMenuOpen(false); action(); };

  return (
    <div className="flex flex-col h-screen bg-background">
      {/* Top Navigation */}
      <header className="fixed top-0 left-0 right-0 z-40 bg-surface text-white py-3 px-6 grid grid-cols-3 items-center h-[60px] border-b border-gray-700">
        {/* Esquerda: Logo + nome da aplicação */}
        <div className="flex items-center gap-3">
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
        </div>

        {/* Centro: Troca de empresa */}
        <div className="flex items-center justify-center gap-2">
          <span className="text-sm text-gray-300">Empresa de trabalho:</span>
          {canSwitchCompany ? (
            <button
              onClick={() => setCompanyModalOpen(true)}
              className="px-2 py-1 rounded border border-gray-700 bg-surface hover:bg-elevated text-white flex items-center gap-2"
              title="Alterar empresa"
              aria-label="Alterar empresa"
            >
              <span>{companyName}</span>
              <Repeat size={14} className="text-gray-300" />
            </button>
          ) : (
            <span className="px-2 py-1 rounded border border-gray-700 bg-surface text-white">{companyName}</span>
          )}
        </div>

        {/* Direita: Usuário e menu */}
        <div className="flex items-center justify-end gap-3">
          <div>
            <ThemeSelector showLabel={false} size="sm" />
          </div>
          <span className="text-sm text-gray-300">{userName}</span>
          <div className="relative" ref={userMenuRef}>
            <button onClick={toggleUserMenu} className="flex items-center space-x-1 focus:outline-none">
              <div className="bg-accent rounded-full p-1 transition-colors duration-200">
                <User size={18} className="text-white" />
              </div>
            </button>
            {userMenuOpen && (
              <div className="absolute right-0 mt-2 w-48 bg-surface shadow-lg rounded-md z-10 border border-gray-700 animate-fadeIn">
                <div className="p-3 border-b border-gray-700">
                  <p className="font-medium text-white">{userName}</p>
                  <p className="text-sm text-gray-400">{companyName}</p>
                  <p className="text-xs text-accent">{userRole}</p>
                </div>
                <div className="p-2">
                  <button onClick={() => handleMenuAction(() => router.push('/profile'))} className="w-full text-left px-3 py-2 text-sm hover:bg-elevated rounded text-gray-300">Meu Perfil</button>
                  <button onClick={() => handleMenuAction(logout)} className="w-full text-left px-3 py-2 text-sm text-red-400 hover:bg-elevated rounded">Sair</button>
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Main Content */}
      <div className="flex h-full pt-[60px]">
        <Sidebar onToggle={handleSidebarToggle} isCollapsed={sidebarCollapsed} />
        <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${sidebarCollapsed ? 'ml-16' : 'ml-52'}`}>
          <main className="flex-1 overflow-y-auto p-6 bg-background text-gray-300">
            {children}
          </main>
        </div>
      </div>

      {canSwitchCompany && (
        <CompanySwitcherModal
          isOpen={companyModalOpen}
          onClose={() => setCompanyModalOpen(false)}
        />
      )}
    </div>
  );
}