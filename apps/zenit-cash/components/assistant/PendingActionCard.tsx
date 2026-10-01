import { PendingAction } from '@zenit/assistant-contracts'
import { Button } from '@/components/ui/Button'

interface PendingActionCardProps {
  pendingAction: PendingAction
  onConfirm: (pendingActionId: number) => Promise<void>
  onCancel: (pendingActionId: number) => Promise<void>
  loading?: boolean
}

export function PendingActionCard({
  pendingAction,
  onConfirm,
  onCancel,
  loading = false
}: PendingActionCardProps) {
  const { summary } = pendingAction
  const isPending = pendingAction.status === 'PENDING'
  const statusLabel =
    pendingAction.status === 'CONFIRMED'
      ? 'Lancamento confirmado.'
      : pendingAction.status === 'CANCELED'
        ? 'Rascunho cancelado.'
        : pendingAction.status === 'FAILED'
          ? 'Rascunho com falha.'
          : pendingAction.status === 'EXPIRED'
            ? 'Rascunho expirado.'
            : null

  return (
    <div className="mt-3 rounded-2xl border border-tone-amber/25 bg-tone-amber-soft p-4 text-sm text-text">
      <div className="mb-2 text-base font-semibold text-text">Rascunho do Operador</div>
      <div>{summary.description}</div>
      <div className="mt-1">
        R$ {summary.amount.toFixed(2)} · {summary.type} · {summary.date}
      </div>
      {summary.category ? <div className="mt-1">Categoria: {summary.category.name}</div> : null}
      {summary.fromAccount ? <div className="mt-1">Origem: {summary.fromAccount.name}</div> : null}
      {summary.toAccount ? <div className="mt-1">Destino: {summary.toAccount.name}</div> : null}
      {summary.status ? <div className="mt-1">Status: {summary.status}</div> : null}

      {isPending ? (
        <div className="mt-4 flex gap-3">
          <Button
            variant="accent"
            disabled={loading}
            onClick={() => void onConfirm(pendingAction.id)}
            className="rounded-2xl px-4 py-2"
          >
            Confirmar
          </Button>
          <Button
            variant="outline"
            disabled={loading}
            onClick={() => void onCancel(pendingAction.id)}
            className="rounded-lg border-border bg-surface px-4 py-2 text-text hover:bg-elevated"
          >
            Cancelar
          </Button>
        </div>
      ) : statusLabel ? (
        <div className="mt-4 font-semibold text-tone-green">{statusLabel}</div>
      ) : null}
    </div>
  )
}
