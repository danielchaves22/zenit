// frontend/hooks/useModalDrawer.ts
import { useState, useEffect } from 'react';
import { useRouter } from 'next/router';

export type ModalAction = 'new' | 'edit' | 'view' | null;

interface UseModalDrawerOptions {
  baseUrl: string; // ex: '/users', '/companies'
}

export function useModalDrawer({ baseUrl }: UseModalDrawerOptions) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [action, setAction] = useState<ModalAction>(null);
  const [itemId, setItemId] = useState<string | null>(null);

  // Sync with URL params
  useEffect(() => {
    const { action: urlAction, id, edit, new: newParam } = router.query;
    
    if (newParam !== undefined) {
      setAction('new');
      setItemId(null);
      setIsOpen(true);
    } else if (edit) {
      setAction('edit');
      setItemId(String(edit));
      setIsOpen(true);
    } else if (urlAction === 'view' && id) {
      setAction('view');
      setItemId(String(id));
      setIsOpen(true);
    } else {
      setIsOpen(false);
      setAction(null);
      setItemId(null);
    }
  }, [router.query]);

  const openModal = (modalAction: ModalAction, id?: string | number) => {
    const params: Record<string, string> = {};
    
    if (modalAction === 'new') {
      params.new = 'true';
    } else if (modalAction === 'edit' && id) {
      params.edit = String(id);
    } else if (modalAction === 'view' && id) {
      params.action = 'view';
      params.id = String(id);
    }

    router.push(
      {
        pathname: baseUrl,
        query: { ...router.query, ...params },
      },
      undefined,
      { shallow: true }
    );
  };

  const closeModal = () => {
    // Remove modal params but keep other query params
    const { action: _, id: __, edit: ___, new: ____, ...restQuery } = router.query;
    
    router.push(
      {
        pathname: baseUrl,
        query: restQuery,
      },
      undefined,
      { shallow: true }
    );
  };

  return {
    isOpen,
    action,
    itemId: itemId ? Number(itemId) : null,
    openModal,
    closeModal,
    // Helper functions
    openNew: () => openModal('new'),
    openEdit: (id: string | number) => openModal('edit', id),
    openView: (id: string | number) => openModal('view', id),
  };
}