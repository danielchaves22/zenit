import Link from 'next/link';
import { useRouter } from 'next/router';
import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, RefreshCw } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigation } from '@/contexts/NavigationContext';
import { api } from '@/lib/api';
import { formatSalePrice } from '@/lib/catalog';
import {
  decimalInput,
  displayDate,
  Purchase,
  purchaseFilters,
  PurchaseInstallment,
  PurchaseOptions,
  statusLabel,
  today
} from '@/lib/purchases';
import { Layout } from './Layout';
import { PurchaseForm } from './PurchaseForm';

export function PaymentDialog({
  purchase,
  installment,
  options,
  companyId,
  onClose,
  onSaved
}: {
  purchase: Purchase;
  installment: PurchaseInstallment | null;
  options: PurchaseOptions;
  companyId: number;
  onClose: () => void;
  onSaved: (value: Purchase) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const lock = useRef(false);
  const [requestKey] = useState(() => crypto.randomUUID());
  const [amount, setAmount] = useState(installment?.amount.replace('.', ',') ?? '');
  const [account, setAccount] = useState(
    String(installment?.account?.id ?? options.accounts[0]?.id ?? '')
  );
  const [date, setDate] = useState(today);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { protect } = useNavigation();
  useEffect(() => {
    dialog.current?.showModal();
    return () => dialog.current?.close();
  }, []);
  useEffect(() => {
    protect(false, busy);
    return () => protect(false, false);
  }, [busy, protect]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (lock.current) return;
    setError('');
    try {
      const payload = installment
        ? {
            requestKey,
            expectedUpdatedAt: installment.updatedAt,
            amount: decimalInput(amount, 2, 12).text,
            fromAccountId: Number(account),
            effectiveDate: date
          }
        : {};
      lock.current = true;
      setBusy(true);
      const updated = await api<Purchase>(
        `/bizz/purchases/${purchase.id}/${installment ? `installments/${installment.id}/settle` : 'cancel'}`,
        { companyId, method: 'POST', body: JSON.stringify(payload) }
      );
      onSaved(updated);
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível concluir a operação.');
    } finally {
      lock.current = false;
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialog}
      className="confirmation-dialog"
      aria-labelledby="purchase-action-title"
      onCancel={(event) => {
        event.preventDefault();
        if (!busy) onClose();
      }}
    >
      <form onSubmit={submit}>
        <fieldset className="contact-form-body stack" disabled={busy}>
          <h2 id="purchase-action-title">
            {installment
              ? `Pagar parcela ${installment.number}/${purchase.installmentCount}`
              : 'Cancelar compra?'}
          </h2>
          {installment ? (
            <>
              <label>
                Valor pago
                <input
                  autoFocus
                  required
                  inputMode="decimal"
                  value={amount}
                  onFocus={(event) => event.target.select()}
                  onChange={(event) => setAmount(event.target.value)}
                />
              </label>
              <label>
                Data do pagamento
                <input
                  required
                  type="date"
                  min="2000-01-01"
                  max="2100-12-31"
                  value={date}
                  onChange={(event) => setDate(event.target.value)}
                />
              </label>
              <label>
                Conta de pagamento
                <select
                  required
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                >
                  {options.accounts.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              {(() => {
                try {
                  return decimalInput(amount, 2, 12).text !== installment.amount;
                } catch {
                  return false;
                }
              })() && (
                <p className="subtle">
                  A parcela será quitada integralmente com o valor informado. O total da compra será
                  preservado.
                </p>
              )}
            </>
          ) : (
            <p>
              As parcelas pendentes serão canceladas também no Cash. A compra continuará no
              histórico.
            </p>
          )}
          {error && (
            <p role="alert" className="form-error">
              {error}
            </p>
          )}
        </fieldset>
        <div className="dialog-actions">
          <button type="button" className="button" disabled={busy} onClick={onClose}>
            {installment ? 'Voltar' : 'Manter compra'}
          </button>
          <button
            type="submit"
            className={`button ${installment ? 'primary' : 'danger'}`}
            disabled={busy}
          >
            {busy ? 'Processando…' : installment ? 'Confirmar pagamento' : 'Cancelar compra'}
          </button>
        </div>
      </form>
    </dialog>
  );
}

function Detail({
  purchase,
  options,
  companyId,
  onBack,
  onSaved,
  onRefresh
}: {
  purchase: Purchase;
  options: PurchaseOptions;
  companyId: number;
  onBack: () => void;
  onSaved: (value: Purchase) => void;
  onRefresh: () => void;
}) {
  const [action, setAction] = useState<{ installment: PurchaseInstallment | null } | null>(null);
  const { notice } = useNavigation();
  return (
    <div className="purchase-editor">
      <div className="page-heading editor-heading">
        <button className="button" onClick={onBack}>
          <ArrowLeft size={18} />
          Voltar
        </button>
        <h1>Compra #{purchase.number}</h1>
      </div>
      {notice && (
        <div className="notice" role="status">
          <Check size={18} />
          {notice}
        </div>
      )}
      <section className="contact-form-panel purchase-summary" aria-label="Dados da compra">
        <dl>
          <div>
            <dt>Fornecedor</dt>
            <dd>{purchase.supplierName}</dd>
          </div>
          <div>
            <dt>Data</dt>
            <dd>{displayDate(purchase.date)}</dd>
          </div>
          <div>
            <dt>Total da compra</dt>
            <dd>{formatSalePrice(purchase.total)}</dd>
          </div>
          <div>
            <dt>Situação</dt>
            <dd>{purchase.status === 'CANCELED' ? 'Cancelada' : 'Confirmada'}</dd>
          </div>
        </dl>
      </section>
      <section
        className="contact-form-panel purchase-section-panel"
        aria-labelledby="purchase-detail-items"
      >
        <h2 id="purchase-detail-items">Itens</h2>
        <table className="purchase-table">
          <thead>
            <tr>
              <th>Produto ou serviço</th>
              <th>Quantidade</th>
              <th>Valor unitário</th>
              <th>Total</th>
            </tr>
          </thead>
          <tbody>
            {purchase.items.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td data-label="Quantidade">
                  {item.quantity.replace(/\.?0+$/, '').replace('.', ',')} {item.unit}
                </td>
                <td data-label="Valor unitário">{formatSalePrice(item.unitPrice)}</td>
                <td data-label="Total">{formatSalePrice(item.total)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      <section
        className="contact-form-panel purchase-section-panel"
        aria-labelledby="purchase-detail-finance"
      >
        <div className="purchase-panel-heading">
          <h2 id="purchase-detail-finance">Financeiro</h2>
          <button className="button quiet" onClick={onRefresh}>
            <RefreshCw size={16} />
            Atualizar
          </button>
        </div>
        {!options.enabled && (
          <p className="purchase-access-note">
            O Cash está desabilitado para esta empresa. Pagamentos indisponíveis.
          </p>
        )}
        {options.enabled && !options.accounts.length && (
          <p className="purchase-access-note">
            Você precisa de acesso a uma conta de pagamento para quitar parcelas.
          </p>
        )}
        <table className="purchase-table installments-table">
          <thead>
            <tr>
              <th>Parcela</th>
              <th>Vencimento</th>
              <th>Valor</th>
              <th>Pagamento</th>
              <th>Situação</th>
              <th>
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {purchase.installments.map((item) => (
              <tr key={item.id}>
                <td data-label="Parcela">
                  {item.number}/{purchase.installmentCount}
                </td>
                <td data-label="Vencimento">{displayDate(item.dueDate)}</td>
                <td data-label="Valor">{formatSalePrice(item.amount)}</td>
                <td data-label="Pagamento">
                  {item.paidAmount ? (
                    <span>
                      {formatSalePrice(item.paidAmount)}
                      <small>{displayDate(item.effectiveDate)}</small>
                      {item.account && <small>{item.account.name}</small>}
                    </span>
                  ) : (
                    <span>—{item.account && <small>{item.account.name}</small>}</span>
                  )}
                </td>
                <td data-label="Situação">
                  <span
                    className={`purchase-status ${item.status === 'PENDING' && item.dueDate < today() ? 'overdue' : ''}`}
                  >
                    {item.status === 'PENDING' && item.dueDate < today()
                      ? 'Vencido'
                      : statusLabel(item.status)}
                  </span>
                </td>
                <td>
                  {item.canSettle && (
                    <button
                      className="button"
                      onClick={() => setAction({ installment: item })}
                      aria-label={`Pagar parcela ${item.number}`}
                    >
                      Pagar
                    </button>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
      {purchase.notes && (
        <section className="contact-form-panel purchase-notes">
          <h2>Observação</h2>
          <p>{purchase.notes}</p>
        </section>
      )}
      {purchase.canCancel && (
        <div className="purchase-bottom-actions">
          <button className="button quiet" onClick={() => setAction({ installment: null })}>
            Cancelar compra
          </button>
        </div>
      )}
      {action && (
        <PaymentDialog
          key={action.installment?.id ?? 'cancel'}
          purchase={purchase}
          installment={action.installment}
          options={options}
          companyId={companyId}
          onClose={() => setAction(null)}
          onSaved={onSaved}
        />
      )}
    </div>
  );
}

function Content({ creating }: { creating: boolean }) {
  const { company } = useAuth();
  const router = useRouter();
  const { complete, setNotice } = useNavigation();
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const [data, setData] = useState<{ options: PurchaseOptions; purchase: Purchase | null } | null>(
    null
  );
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const filters = purchaseFilters(router.query);
  const back = () => void router.push({ pathname: '/compras', query: filters });
  useEffect(() => {
    if (!company || !router.isReady || (!creating && !id)) return;
    const controller = new AbortController();
    setError('');
    setData(null);
    void Promise.all([
      api<PurchaseOptions>('/bizz/purchases/options', {
        companyId: company.id,
        signal: controller.signal
      }),
      creating
        ? Promise.resolve(null)
        : api<Purchase>(`/bizz/purchases/${encodeURIComponent(id)}`, {
            companyId: company.id,
            signal: controller.signal
          })
    ])
      .then(([options, purchase]) => {
        if (!controller.signal.aborted) setData({ options, purchase });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(cause instanceof Error ? cause.message : 'Não foi possível carregar a compra.');
      });
    return () => controller.abort();
  }, [company?.id, creating, id, router.isReady, revision]);
  if (error)
    return (
      <div className="list-state">
        <p role="alert" className="form-error">
          {error}
        </p>
        <button className="button" onClick={() => setRevision((value) => value + 1)}>
          Tentar novamente
        </button>
        <Link className="button quiet" href={{ pathname: '/compras', query: filters }}>
          Voltar
        </Link>
      </div>
    );
  if (!company || !data)
    return (
      <div className="list-state" role="status">
        Carregando compra…
      </div>
    );
  if (creating && (!data.options.enabled || !data.options.accounts.length))
    return (
      <div className="list-state">
        <h1>Nova compra</h1>
        <p role="alert">
          {!data.options.enabled
            ? 'Habilite o Zenit Cash para esta empresa para registrar compras integradas.'
            : 'É necessário ter acesso a uma conta bancária ou de caixa ativa para registrar a compra.'}
        </p>
        <button className="button" onClick={back}>
          Voltar
        </button>
      </div>
    );
  if (creating)
    return (
      <PurchaseForm
        companyId={company.id}
        options={data.options}
        onBack={back}
        onSaved={(purchase) => {
          setNotice('Compra registrada.');
          complete(
            () => void router.replace({ pathname: `/compras/${purchase.id}`, query: filters })
          );
        }}
      />
    );
  return (
    <Detail
      key={data.purchase!.id}
      purchase={data.purchase!}
      options={data.options}
      companyId={company.id}
      onBack={back}
      onRefresh={() => setRevision((value) => value + 1)}
      onSaved={(purchase) => {
        setData({ ...data, purchase });
        setNotice(purchase.status === 'CANCELED' ? 'Compra cancelada.' : 'Pagamento registrado.');
      }}
    />
  );
}
export function PurchasePage({ creating = false }: { creating?: boolean }) {
  const router = useRouter();
  return (
    <Layout
      breadcrumbs={[
        { label: 'Operação' },
        { label: 'Compras', href: { pathname: '/compras', query: purchaseFilters(router.query) } },
        { label: creating ? 'Nova compra' : 'Consultar compra' }
      ]}
    >
      <Content creating={creating} />
    </Layout>
  );
}
