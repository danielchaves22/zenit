import React, { useEffect } from 'react';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  footer?: React.ReactNode;
  loading?: boolean;
}

export function Modal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  loading = false
}: ModalProps) {
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

  const handleBackdropClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget && !loading) {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-hidden">
      <div
        className="absolute inset-0 bg-black/60 backdrop-blur-sm transition-opacity duration-300"
        onClick={handleBackdropClick}
      />

      <div className="absolute inset-0 flex items-center justify-center p-4">
        <div className="w-full max-w-md transform transition-all duration-300 ease-out">
          <div className="bg-[#151921] rounded-2xl shadow-2xl border border-gray-700 overflow-hidden">
            <div className="px-6 pt-6 pb-4 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-white">{title}</h3>
              <button
                onClick={onClose}
                disabled={loading}
                className="p-1 text-gray-400 hover:text-white transition-colors rounded-full hover:bg-gray-800"
                aria-label="Fechar"
              >
                <X size={18} />
              </button>
            </div>

            <div className="px-6 pb-6">{children}</div>

            {footer && (
              <div className="px-6 py-4 bg-[#0f1419] border-t border-gray-700">
                {footer}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
