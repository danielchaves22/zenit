import React, { useState } from 'react';
import { CircleHelp, Info } from 'lucide-react';
import { Button } from './Button';
import { Modal } from './Modal';

interface InfoModalButtonProps {
  modalTitle: string;
  buttonLabel: string;
  children: React.ReactNode;
  size?: 'default' | 'compact';
}

export function InfoModalButton({
  modalTitle,
  buttonLabel,
  children,
  size = 'default'
}: InfoModalButtonProps) {
  const [isOpen, setIsOpen] = useState(false);
  const compact = size === 'compact';

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={
          compact
            ? 'inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-elevated hover:text-accent focus:outline-none focus:ring-2 focus:ring-accent/60'
            : 'inline-flex h-9 w-9 items-center justify-center rounded-full border border-gray-600 text-gray-300 transition-colors hover:border-accent hover:bg-elevated hover:text-accent'
        }
        aria-label={buttonLabel}
        title={buttonLabel}
      >
        {compact ? <CircleHelp size={14} /> : <Info size={16} />}
      </button>

      <Modal
        isOpen={isOpen}
        onClose={() => setIsOpen(false)}
        title={modalTitle}
        footer={(
          <div className="flex justify-end">
            <Button variant="outline" onClick={() => setIsOpen(false)}>
              Fechar
            </Button>
          </div>
        )}
      >
        <div className="space-y-3 text-sm leading-relaxed text-gray-300">
          {children}
        </div>
      </Modal>
    </>
  );
}
