// frontend/hooks/useConfirmation.ts
import { useState, useCallback } from 'react';

interface ConfirmationOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

export function useConfirmation() {
  const [isOpen, setIsOpen] = useState(false);
  const [options, setOptions] = useState<ConfirmationOptions>({
    title: '',
    message: ''
  });
  const [loading, setLoading] = useState(false);
  const [onConfirmCallback, setOnConfirmCallback] = useState<(() => void | Promise<void>) | null>(null);

  const confirm = useCallback((
    confirmOptions: ConfirmationOptions,
    onConfirm: () => void | Promise<void>
  ) => {
    setOptions(confirmOptions);
    setOnConfirmCallback(() => onConfirm);
    setIsOpen(true);
  }, []);

  const handleConfirm = useCallback(async () => {
    if (onConfirmCallback) {
      setLoading(true);
      try {
        await onConfirmCallback();
        setIsOpen(false);
        setOnConfirmCallback(null);
      } catch (error) {
        // Let the calling component handle the error
        console.error('Confirmation action failed:', error);
      } finally {
        setLoading(false);
      }
    }
  }, [onConfirmCallback]);

  const handleClose = useCallback(() => {
    if (!loading) {
      setIsOpen(false);
      setOnConfirmCallback(null);
      setLoading(false);
    }
  }, [loading]);

  return {
    isOpen,
    options,
    loading,
    confirm,
    handleConfirm,
    handleClose
  };
}