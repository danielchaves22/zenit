// frontend/components/ui/ConfirmationModal.tsx
import React, { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';
import { Button } from './Button';

interface ConfirmationModalProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
  loading?: boolean;
}

export function ConfirmationModal({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = 'Confirmar',
  cancelText = 'Cancelar',
  type = 'danger',
  loading = false
}: ConfirmationModalProps) {
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

  // Handle backdrop click
  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  const iconColors = {
    danger: 'text-red-400',
    warning: 'text-yellow-400',
    info: 'text-blue-400'
  };

  const confirmVariants = {
    danger: 'danger' as const,
    warning: 'accent' as const,
    info: 'primary' as const
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={handleBackdropClick}
      />
      
      {/* Modal */}
      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md transform transition-all duration-300 ease-out">
          <div className="bg-surface rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
            {/* Header */}
            <div className="px-6 pt-6 pb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-full bg-gray-800 ${iconColors[type]}`}>
                    <AlertTriangle size={20} />
                  </div>
                  <h3 className="text-lg font-semibold text-white">
                    {title}
                  </h3>
                </div>
                
                <button
                  onClick={onClose}
                  disabled={loading}
                  className="p-1 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-800"
                  aria-label="Fechar"
                >
                  <X size={18} />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="px-6 pb-6">
              <p className="text-gray-300 leading-relaxed">
                {message}
              </p>
            </div>

            {/* Actions */}
            <div className="px-6 py-4 bg-elevated border-t border-gray-700">
              <div className="flex gap-3 justify-end">
                <Button
                  variant="outline"
                  onClick={onClose}
                  disabled={loading}
                  className="min-w-[80px]"
                >
                  {cancelText}
                </Button>
                <Button
                  variant={confirmVariants[type]}
                  onClick={onConfirm}
                  disabled={loading}
                  className="min-w-[80px]"
                >
                  {loading ? 'Processando...' : confirmText}
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}