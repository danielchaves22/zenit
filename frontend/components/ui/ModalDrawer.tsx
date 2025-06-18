// frontend/components/ui/ModalDrawer.tsx
import React, { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
import { Button } from './Button';

interface ModalDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  subtitle?: string;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  children: React.ReactNode;
  footer?: React.ReactNode;
  loading?: boolean;
}

export function ModalDrawer({
  isOpen,
  onClose,
  title,
  subtitle,
  size = 'md',
  children,
  footer,
  loading = false
}: ModalDrawerProps) {
  const drawerRef = useRef<HTMLDivElement>(null);

  // Handle ESC key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !loading) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      document.body.style.overflow = 'hidden';
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose, loading]);

  // Handle click outside
  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  const sizeClasses = {
    sm: 'max-w-md',
    md: 'max-w-lg',
    lg: 'max-w-2xl',
    xl: 'max-w-4xl'
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/50 backdrop-blur-sm transition-opacity duration-300"
        onClick={handleOverlayClick}
      />
      
      {/* Drawer */}
      <div className="absolute inset-y-0 right-0 flex max-w-full pl-10 sm:pl-16">
        <div
          ref={drawerRef}
          className={`w-screen ${sizeClasses[size]} transform transition-transform duration-300 ease-in-out`}
        >
          <div className="flex h-full flex-col bg-surface shadow-2xl border-l border-gray-700">
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-700">
              <div className="flex-1 min-w-0">
                <h2 className="text-xl font-semibold text-white truncate">
                  {title}
                </h2>
                {subtitle && (
                  <p className="text-sm text-gray-400 mt-1 truncate">
                    {subtitle}
                  </p>
                )}
              </div>
              
              <Button
                variant="outline"
                onClick={onClose}
                disabled={loading}
                className="ml-4 p-2 hover:bg-elevated"
                aria-label="Fechar"
              >
                <X size={20} />
              </Button>
            </div>

            {/* Content */}
            <div className="flex-1 overflow-y-auto">
              <div className="px-6 py-6">
                {children}
              </div>
            </div>

            {/* Footer */}
            {footer && (
              <div className="border-t border-gray-700 px-6 py-4 bg-elevated">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}