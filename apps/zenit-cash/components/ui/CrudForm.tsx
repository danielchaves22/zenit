// frontend/components/ui/CrudForm.tsx
import React from 'react';
import { Button } from './Button';
import { ModalDrawer } from './ModalDrawer';
import { ModalAction } from '@/hooks/useModalDrawer';

interface CrudFormProps {
  isOpen: boolean;
  onClose: () => void;
  action: ModalAction;
  itemId?: number | null;
  title: string;
  children: React.ReactNode;
  onSubmit: (e: React.FormEvent) => void;
  loading?: boolean;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  submitText?: string;
  deleteButton?: React.ReactNode;
}

export function CrudForm({
  isOpen,
  onClose,
  action,
  itemId,
  title,
  children,
  onSubmit,
  loading = false,
  size = 'md',
  submitText,
  deleteButton
}: CrudFormProps) {
  const getTitle = () => {
    switch (action) {
      case 'new':
        return `Novo ${title}`;
      case 'edit':
        return `Editar ${title}`;
      case 'view':
        return `Visualizar ${title}`;
      default:
        return title;
    }
  };

  const getSubmitText = () => {
    if (submitText) return submitText;
    
    switch (action) {
      case 'new':
        return 'Criar';
      case 'edit':
        return 'Salvar Alterações';
      default:
        return 'Salvar';
    }
  };

  const isReadOnly = action === 'view';

  const footer = (
    <div className="flex items-center justify-between gap-3">
      <div>
        {deleteButton && action === 'edit' && deleteButton}
      </div>
      
      <div className="flex gap-3">
        <Button
          type="button"
          variant="outline"
          onClick={onClose}
          disabled={loading}
        >
          {isReadOnly ? 'Fechar' : 'Cancelar'}
        </Button>
        
        {!isReadOnly && (
          <Button
            type="submit"
            variant="accent"
            disabled={loading}
            form="crud-form"
          >
            {loading ? 'Salvando...' : getSubmitText()}
          </Button>
        )}
      </div>
    </div>
  );

  return (
    <ModalDrawer
      isOpen={isOpen}
      onClose={onClose}
      title={getTitle()}
      size={size}
      footer={footer}
      loading={loading}
    >
      <form id="crud-form" onSubmit={onSubmit} className="space-y-4">
        {children}
      </form>
    </ModalDrawer>
  );
}