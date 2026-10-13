import { useEffect, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import { ArrowLeft, ArrowRight, Plus, Search, ShoppingBag } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigation } from '@/contexts/NavigationContext';
import { api } from '@/lib/api';
import { formatSalePrice } from '@/lib/catalog';
import { displayDate, Purchase, purchaseFilters, statusLabel, today } from '@/lib/purchases';

export function Purchases() {
  const { company } = useAuth();
  const router = useRouter();
  const { notice } = useNavigation();
  const filters = purchaseFilters(router.query);
  const { q, status, page } = filters;
  const [result, setResult] = useState<{ items: Purchase[]; total: number } | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const update = (values: Partial<typeof filters>) =>
    void router.replace({ pathname: '/compras', query: { ...filters, ...values } }, undefined, {
      shallow: true,
      scroll: false
    });
  useEffect(() => {
    if (!company || !router.isReady) return;
    const controller = new AbortController();
    setResult(null);
    setError('');
    const timer = setTimeout(
      () => {
        void api<{ items: Purchase[]; total: number }>(
          `/bizz/purchases?${new URLSearchParams({ q, status, page })}`,
          { companyId: company.id, signal: controller.signal }
        )
          .then((data) => {
            if (!controller.signal.aborted) setResult(data);
          })
          .catch((cause) => {
            if (!controller.signal.aborted)
              setError(
                cause instanceof Error ? cause.message : 'Não foi possível carregar as compras.'
              );
          });
      },
      q ? 250 : 0
    );
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [company?.id, q, status, page, revision, router.isReady]);
  const pages = Math.max(1, Math.ceil((result?.total ?? 0) / 20));
  return (
    <>
      <div className="page-heading">
        <h1>Compras</h1>
        <Link className="button primary" href={{ pathname: '/compras/nova', query: filters }}>
          <Plus size={18} />
          Nova compra
        </Link>
      </div>
      {notice && (
        <div className="notice" role="status">
          {notice}
        </div>
      )}
      <section className="contacts-panel" aria-label="Lista de compras">
        <div className="list-toolbar purchase-toolbar">
          <label className="search-field">
            <Search size={18} />
            <input
              type="search"
              aria-label="Pesquisar compras"
              placeholder="Buscar por fornecedor ou número"
              maxLength={100}
              value={q}
              onChange={(event) => update({ q: event.target.value, page: '1' })}
            />
          </label>
          <label className="status-filter">
            <span>Situação</span>
            <select
              value={status}
              onChange={(event) => update({ status: event.target.value, page: '1' })}
            >
              <option value="all">Todas</option>
              <option value="pending">A pagar</option>
              <option value="paid">Pagas</option>
              <option value="canceled">Canceladas</option>
            </select>
          </label>
        </div>
        {error ? (
          <div className="list-state">
            <p className="form-error" role="alert">
              {error}
            </p>
            <button className="button" onClick={() => setRevision((value) => value + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : !result ? (
          <div className="list-state" role="status">
            Carregando compras…
          </div>
        ) : !result.items.length ? (
          <div className="empty-state">
            <ShoppingBag size={28} />
            <h2>Nenhuma compra encontrada</h2>
            {Number(page) > 1 && (
              <button className="button" onClick={() => update({ page: '1' })}>
                Primeira página
              </button>
            )}
          </div>
        ) : (
          <table className="purchase-table purchase-list">
            <thead>
              <tr>
                <th>Compra</th>
                <th>Data</th>
                <th>Total</th>
                <th>Próximo vencimento</th>
                <th>Pagamento</th>
              </tr>
            </thead>
            <tbody>
              {result.items.map((purchase) => (
                <tr key={purchase.id}>
                  <td>
                    <Link
                      className="name-button"
                      href={{ pathname: `/compras/${purchase.id}`, query: filters }}
                    >
                      #{purchase.number} · {purchase.supplierName}
                    </Link>
                  </td>
                  <td data-label="Data">{displayDate(purchase.date)}</td>
                  <td data-label="Total">{formatSalePrice(purchase.total)}</td>
                  <td data-label="Vencimento">{displayDate(purchase.nextDueDate)}</td>
                  <td data-label="Pagamento">
                    <span
                      className={`purchase-status ${purchase.status === 'PENDING' && purchase.nextDueDate && purchase.nextDueDate < today() ? 'overdue' : ''}`}
                    >
                      {purchase.status === 'PENDING' &&
                      purchase.nextDueDate &&
                      purchase.nextDueDate < today()
                        ? 'Vencido'
                        : statusLabel(purchase.status)}
                    </span>
                    {purchase.installmentCount > 1 && (
                      <small>
                        {purchase.paidCount} de {purchase.installmentCount} parcelas pagas
                      </small>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {result && (
          <div className="list-footer">
            <span>
              {result.total} {result.total === 1 ? 'compra' : 'compras'}
            </span>
            <div className="pagination">
              <button
                className="icon-button"
                aria-label="Página anterior"
                disabled={Number(page) <= 1}
                onClick={() => update({ page: String(Number(page) - 1) })}
              >
                <ArrowLeft size={18} />
              </button>
              <span>
                {page} / {pages}
              </span>
              <button
                className="icon-button"
                aria-label="Próxima página"
                disabled={Number(page) >= pages}
                onClick={() => update({ page: String(Number(page) + 1) })}
              >
                <ArrowRight size={18} />
              </button>
            </div>
          </div>
        )}
      </section>
    </>
  );
}
