// frontend/hooks/useConfirmation.ts
import { useState, useCallback } from 'react';

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export function useConfirmation() {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ConfirmationOptions>({
    title: '',
    message: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    type: 'danger'
  });
  const [resolveCallback, setResolveCallback] = useState<(() => void) | null>(null);

  const confirm = useCallback((
    confirmOptions: ConfirmationOptions,
    onConfirm: () => void | Promise<void>
  ) => {
    setOptions({
      ...confirmOptions,
      confirmText: confirmOptions.confirmText || 'Confirmar',
      cancelText: confirmOptions.cancelText || 'Cancelar',
      type: confirmOptions.type || 'danger'
    });
    setResolveCallback(() => onConfirm);
    setIsOpen(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!resolveCallback) return;

    setLoading(true);
    try {
      await resolveCallback();
      setIsOpen(false);
      setResolveCallback(null);
    } catch (error) {
      // Error handling is done by the caller
      console.error('Confirmation action failed:', error);
    } finally {
      setLoading(false);
    }
  }, [resolveCallback]);

  const handleClose = useCallback(() => {
    if (loading) return; // Prevent closing while loading
    
    setIsOpen(false);
    setResolveCallback(null);
    setLoading(false);
  }, [loading]);

  return {
    isOpen,
    loading,
    options,
    confirm,
    handleConfirm,
    handleClose
  };
}