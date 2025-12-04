import React, { useState, useEffect } from 'react';
import { Modal } from './Modal';
import { Button } from './Button';
import { useAuth } from '@/contexts/AuthContext';
import { useRouter } from 'next/router';

interface CompanySwitcherModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CompanySwitcherModal({ isOpen, onClose }: CompanySwitcherModalProps) {
  const { user, companyId, changeCompany } = useAuth();
  const router = useRouter();
  const [selected, setSelected] = useState<number | null>(companyId);

  useEffect(() => {
    if (isOpen) {
      setSelected(companyId);
    }
  }, [isOpen, companyId]);

  const handleConfirm = () => {
    if (selected && selected !== companyId) {
      changeCompany(selected);
    }
    onClose();
    router.push('/');
  };

  const footer = (
    <div className="flex justify-end gap-2">
      <Button variant="outline" onClick={onClose}>Cancelar</Button>
      <Button onClick={handleConfirm}>Confirmar</Button>
    </div>
  );

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Selecionar Empresa" footer={footer}>
      <div className="space-y-4">
        {user?.companies.map((comp) => (
          <label key={comp.id} className="flex items-center gap-2 cursor-pointer">
            <input
              type="radio"
              checked={selected === comp.id}
              onChange={() => setSelected(comp.id)}
              className="form-radio text-accent"
            />
            <span className="text-gray-300">{comp.name}</span>
          </label>
        ))}
      </div>
    </Modal>
  );
}
