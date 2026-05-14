import React from 'react';
import { Button } from '@/components/ui/Button';
import { Input } from '@/components/ui/Input';
import { Modal } from '@/components/ui/Modal';
import { formatAccountDisplayName } from '@/utils/accounts';

type SettlementKind = 'INCOME' | 'EXPENSE';

interface AccountOption {
  id: number;
  name: string;
  type: string;
}

interface TransactionSettlementModalProps {
  isOpen: boolean;
  kind: SettlementKind;
  accounts: AccountOption[];
  accountId: string;
  settlementDate: string;
  notes: string;
  loading?: boolean;
  title?: string;
  confirmLabel?: string;
  onClose: () => void;
  onConfirm: () => void;
  onAccountIdChange: (value: string) => void;
  onSettlementDateChange: (value: string) => void;
  onNotesChange: (value: string) => void;
}

function getAccountLabel(kind: SettlementKind) {
  return kind === 'EXPENSE' ? 'Conta do pagamento' : 'Conta do recebimento';
}

function getDateLabel(kind: SettlementKind) {
  return kind === 'EXPENSE' ? 'Data do pagamento' : 'Data do recebimento';
}

function getDefaultTitle(kind: SettlementKind) {
  return kind === 'EXPENSE' ? 'Registrar pagamento' : 'Registrar recebimento';
}

function getDefaultConfirmLabel(kind: SettlementKind) {
  return kind === 'EXPENSE' ? 'Liquidar despesa' : 'Liquidar receita';
}

export default function TransactionSettlementModal({
  isOpen,
  kind,
  accounts,
  accountId,
  settlementDate,
  notes,
  loading = false,
  title,
  confirmLabel,
  onClose,
  onConfirm,
  onAccountIdChange,
  onSettlementDateChange,
  onNotesChange
}: TransactionSettlementModalProps) {
  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title={title || getDefaultTitle(kind)}
      loading={loading}
      footer={
        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={onClose} disabled={loading}>
            Cancelar
          </Button>
          <Button variant="accent" onClick={onConfirm} disabled={loading}>
            {loading ? 'Salvando...' : confirmLabel || getDefaultConfirmLabel(kind)}
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        <div>
          <label className="mb-1 block text-sm font-medium text-gray-300">
            {getAccountLabel(kind)}
          </label>
          <select
            value={accountId}
            onChange={(event) => onAccountIdChange(event.target.value)}
            className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
            disabled={loading}
          >
            <option value="">Selecione uma conta</option>
            {accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {formatAccountDisplayName(account)}
              </option>
            ))}
          </select>
        </div>

        <Input
          label={getDateLabel(kind)}
          type="date"
          value={settlementDate}
          onChange={(event) => onSettlementDateChange(event.target.value)}
          disabled={loading}
          className="mb-0"
        />

        <div>
          <div className="mb-1 text-sm font-medium text-gray-300">Observações</div>
          <textarea
            value={notes}
            onChange={(event) => onNotesChange(event.target.value)}
            rows={4}
            className="w-full rounded border border-gray-700 bg-background px-2 py-1.5 text-white focus:border-blue-500 focus:outline-none focus:ring"
            placeholder="Opcional"
            disabled={loading}
          />
        </div>
      </div>
    </Modal>
  );
}
