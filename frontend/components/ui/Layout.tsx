// frontend/components/ui/Layout.tsx
import React from 'react';
import { useRouter } from 'next/router';
import Link from 'next/link';
import { useAuth } from '../../contexts/AuthContext';
import { Button } from './Button';

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const { logout } = useAuth();
  const router = useRouter();

  const isHome = router.pathname === '/';

  return (
    <div className="min-h-screen bg-neutral text-gray-800 font-sans">
      {/* Navbar */}
      <header className="bg-white shadow-md py-4 px-6 flex justify-between items-center sticky top-0 z-10">
        <div className="flex items-center space-x-4">
          <img src="/assets/logo.png" alt="Logo" className="h-6" />
          {!isHome && (
            <Link href="/">
              <Button variant="outline" className="text-sm px-3 py-1">
                ← Início
              </Button>
            </Link>
          )}
        </div>
        <Button variant="danger" onClick={logout}>Sair</Button>
      </header>

      <main className="max-w-5xl mx-auto py-12 px-6">{children}</main>
    </div>
  );
}
