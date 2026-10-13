import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/router';
import {
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Package,
  Pencil,
  Plus,
  Search,
  X
} from 'lucide-react';
import { useNavigation } from '@/contexts/NavigationContext';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import {
  CatalogList,
  catalogFilters,
  CATALOG_PATH,
  formatSalePrice,
  usageLabel
} from '@/lib/catalog';

export function CatalogItems() {
  const { company } = useAuth();
  const router = useRouter();
  const listQuery = catalogFilters(router.query);
  const { q, kind, usage, status } = listQuery;
  const page = Number(listQuery.page);
  const editHref = (id: string) => ({ pathname: `${CATALOG_PATH}/${id}`, query: listQuery });
  const updateFilters = (changes: Partial<typeof listQuery>) => {
    void router.replace(
      { pathname: CATALOG_PATH, query: { ...listQuery, ...changes } },
      undefined,
      { shallow: true, scroll: false }
    );
  };
  const [result, setResult] = useState<CatalogList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const { notice, setNotice } = useNavigation();
  const sequence = useRef(0);
  useEffect(() => {
    if (!company || !router.isReady) return;
    const current = ++sequence.current;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setResult(null);
    const timer = window.setTimeout(
      () => {
        const params = new URLSearchParams({ q, kind, usage, status, page: String(page) });
        void api<CatalogList>(`/bizz/catalog?${params}`, {
          companyId: company.id,
          signal: controller.signal
        })
          .then((data) => {
            if (sequence.current === current) setResult(data);
          })
          .catch((cause) => {
            if (!controller.signal.aborted && sequence.current === current)
              setError(
                cause instanceof Error ? cause.message : 'Não foi possível carregar os cadastros.'
              );
          })
          .finally(() => {
            if (!controller.signal.aborted && sequence.current === current) setLoading(false);
          });
      },
      q ? 250 : 0
    );
    return () => {
      window.clearTimeout(timer);
      controller.abort();
      sequence.current++;
    };
  }, [company?.id, q, kind, usage, status, page, revision, router.isReady]);
  const pages = Math.max(1, Math.ceil((result?.total ?? 0) / 20));
  return (
    <>
      <div className="page-heading">
        <h1>Produtos e serviços</h1>
        <Link className="button primary" href={editHref('novo')} onClick={() => setNotice('')}>
          <Plus size={19} />
          Novo cadastro
        </Link>
      </div>
      {notice && (
        <div className="notice" role="status">
          <CheckCircle2 size={19} />
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Fechar mensagem"
            onClick={() => setNotice('')}
          >
            <X size={16} />
          </button>
        </div>
      )}
      <section className="contacts-panel" aria-label="Lista de produtos e serviços">
        <div className="list-toolbar">
          <label className="search-field">
            <Search size={19} />
            <input
              type="search"
              aria-label="Pesquisar produtos e serviços"
              placeholder="Pesquisar produtos e serviços"
              maxLength={100}
              value={q}
              onChange={(event) => updateFilters({ q: event.target.value, page: '1' })}
            />
          </label>
          <label className="status-filter">
            <span>Tipo</span>
            <select
              value={kind}
              onChange={(event) =>
                updateFilters({ kind: event.target.value as typeof kind, page: '1' })
              }
            >
              <option value="all">Todos</option>
              <option value="PRODUCT">Produtos</option>
              <option value="SERVICE">Serviços</option>
            </select>
          </label>
          <label className="status-filter">
            <span>Utilização</span>
            <select
              value={usage}
              onChange={(event) =>
                updateFilters({ usage: event.target.value as typeof usage, page: '1' })
              }
            >
              <option value="all">Todas</option>
              <option value="purchase">Compra</option>
              <option value="sale">Venda</option>
              <option value="both">Compra e venda</option>
            </select>
          </label>
          <label className="status-filter">
            <span>Situação</span>
            <select
              value={status}
              onChange={(event) =>
                updateFilters({ status: event.target.value as typeof status, page: '1' })
              }
            >
              <option value="active">Ativos</option>
              <option value="inactive">Inativos</option>
              <option value="all">Todos</option>
            </select>
          </label>
        </div>
        {loading ? (
          <div className="list-state" role="status">
            <span className="spinner" />
            Carregando cadastros…
          </div>
        ) : error ? (
          <div className="list-state">
            <p className="form-error" role="alert">
              {error}
            </p>
            <button className="button" onClick={() => setRevision((value) => value + 1)}>
              Tentar novamente
            </button>
          </div>
        ) : !result?.items.length ? (
          <div className="empty-state">
            <div className="empty-symbol">
              <Package size={30} strokeWidth={1.5} />
            </div>
            <h2>Nenhum produto ou serviço encontrado</h2>
            {!q && status === 'active' && (
              <Link className="button" href={editHref('novo')} onClick={() => setNotice('')}>
                <Plus size={17} />
                Novo cadastro
              </Link>
            )}
            {page > 1 && (
              <button className="button" onClick={() => updateFilters({ page: '1' })}>
                Voltar à primeira página
              </button>
            )}
          </div>
        ) : (
          <>
            <table className="contacts-table catalog-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Unidade</th>
                  <th>Utilização</th>
                  <th>Preço de venda</th>
                  <th>Situação</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((item) => (
                  <tr key={item.id}>
                    <td className="catalog-name">
                      <Link
                        className="name-button"
                        href={editHref(item.id)}
                        onClick={() => setNotice('')}
                      >
                        {item.name}
                      </Link>
                      <small>{item.kind === 'PRODUCT' ? 'Produto' : 'Serviço'}</small>
                    </td>
                    <td data-label="Unidade">{item.unit}</td>
                    <td data-label="Utilização">{usageLabel(item)}</td>
                    <td data-label="Preço de venda" className="catalog-price">
                      {formatSalePrice(item.salePrice)}
                    </td>
                    <td data-label="Situação">
                      <span className={`status-badge ${item.active ? '' : 'inactive'}`}>
                        <span />
                        {item.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="row-action">
                      <Link
                        className="icon-button"
                        aria-label={`Editar ${item.name}`}
                        href={editHref(item.id)}
                        onClick={() => setNotice('')}
                      >
                        <Pencil size={17} />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <footer className="list-footer">
              <span>
                {result.total} {result.total === 1 ? 'cadastro' : 'cadastros'}
              </span>
              <div className="pagination">
                <button
                  className="icon-button"
                  aria-label="Página anterior"
                  disabled={page === 1}
                  onClick={() => updateFilters({ page: String(page - 1) })}
                >
                  <ArrowLeft size={17} />
                </button>
                <span>
                  {page} de {pages}
                </span>
                <button
                  className="icon-button"
                  aria-label="Próxima página"
                  disabled={page >= pages}
                  onClick={() => updateFilters({ page: String(page + 1) })}
                >
                  <ArrowRight size={17} />
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
    </>
  );
}
