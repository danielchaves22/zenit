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
    <div className="mt-3 rounded-3xl border border-[#efcf9d] bg-[#fdf6e9] p-4 text-sm text-[#4e4a43]">
      <div className="mb-2 text-base font-semibold text-[#171717]">Rascunho do Operador</div>
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
            className="rounded-2xl border-[#d6d0c7] bg-white px-4 py-2 text-[#26282b] hover:border-[#d6d0c7] hover:bg-[#f7f3ed] hover:text-[#26282b]"
          >
            Cancelar
          </Button>
        </div>
      ) : statusLabel ? (
        <div className="mt-4 font-semibold text-[#204b35]">{statusLabel}</div>
      ) : null}
    </div>
  )
}
