// frontend/hooks/useConfirmation.ts - VERSÃO ATUALIZADA COM CALLBACK DE CANCELAMENTO
import { useState, useCallback } from 'react';

export interface ConfirmationOptions {
  title: string;
  message: string;
  confirmText?: string;
  cancelText?: string;
  type?: 'danger' | 'warning' | 'info';
}

interface UseConfirmationReturn {
  isOpen: boolean;
  loading: boolean;
  options: ConfirmationOptions;
  confirm: (
    options: ConfirmationOptions, 
    onConfirm: () => Promise<void> | void,
    onCancel?: () => void
  ) => void;
  handleConfirm: () => void;
  handleClose: () => void;
}

export function useConfirmation(): UseConfirmationReturn {
  const [isOpen, setIsOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [options, setOptions] = useState<ConfirmationOptions>({
    title: '',
    message: '',
    confirmText: 'Confirmar',
    cancelText: 'Cancelar',
    type: 'info'
  });
  const [onConfirmCallback, setOnConfirmCallback] = useState<(() => Promise<void> | void) | null>(null);
  const [onCancelCallback, setOnCancelCallback] = useState<(() => void) | null>(null);

  // ✅ FUNÇÃO PARA ABRIR O MODAL DE CONFIRMAÇÃO COM CALLBACK DE CANCELAMENTO
  const confirm = useCallback((
    confirmationOptions: ConfirmationOptions, 
    onConfirm: () => Promise<void> | void,
    onCancel?: () => void
  ) => {
    setOptions({
      confirmText: 'Confirmar',
      cancelText: 'Cancelar',
      type: 'info',
      ...confirmationOptions
    });
    setOnConfirmCallback(() => onConfirm);
    setOnCancelCallback(onCancel ? () => onCancel : null);
    setIsOpen(true);
    setLoading(false);
  }, []);

  // ✅ FUNÇÃO PARA EXECUTAR A AÇÃO DE CONFIRMAÇÃO
  const handleConfirm = useCallback(async () => {
    if (!onConfirmCallback) return;

    setLoading(true);
    
    try {
      await onConfirmCallback();
      setIsOpen(false);
      setOnConfirmCallback(null);
      setOnCancelCallback(null);
    } catch (error) {
      // O erro é re-lançado para que o componente pai possa tratá-lo
      // O modal permanece aberto em caso de erro
      console.error('Erro na confirmação:', error);
    } finally {
      setLoading(false);
    }
  }, [onConfirmCallback]);

  // ✅ FUNÇÃO PARA FECHAR O MODAL COM CALLBACK DE CANCELAMENTO
  const handleClose = useCallback(() => {
    if (loading) return; // Não permitir fechar durante operação
    
    // ✅ EXECUTAR CALLBACK DE CANCELAMENTO SE EXISTIR
    if (onCancelCallback) {
      onCancelCallback();
    }
    
    setIsOpen(false);
    setOnConfirmCallback(null);
    setOnCancelCallback(null);
    setLoading(false);
  }, [loading, onCancelCallback]);

  return {
    isOpen,
    loading,
    options,
    confirm,
    handleConfirm,
    handleClose
  };
}