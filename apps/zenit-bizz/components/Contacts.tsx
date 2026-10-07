import { useEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, CheckCircle2, Pencil, Plus, Search, Truck, Users, X } from 'lucide-react';
import { useAuth } from '@/contexts/AuthContext';
import { api } from '@/lib/api';
import { Contact, ContactList } from '@/lib/types';
import { ContactForm } from './ContactForm';

export function Contacts({ role }: { role: 'customer' | 'supplier' }) {
  const { company } = useAuth();
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState('active');
  const [page, setPage] = useState(1);
  const [result, setResult] = useState<ContactList | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const [editor, setEditor] = useState<{ contact: Contact | null } | null>(null);
  const [notice, setNotice] = useState('');
  const request = useRef(0);
  const customer = role === 'customer';
  const title = customer ? 'Clientes' : 'Fornecedores';
  const Icon = customer ? Users : Truck;
  useEffect(() => {
    if (!company) return;
    const sequence = ++request.current;
    const controller = new AbortController();
    setLoading(true);
    setError('');
    setResult(null);
    const timeout = window.setTimeout(
      () => {
        const params = new URLSearchParams({ role, q: query, status, page: String(page) });
        void api<ContactList>(`/bizz/contacts?${params}`, {
          companyId: company.id,
          signal: controller.signal
        })
          .then((data) => {
            if (sequence === request.current) setResult(data);
          })
          .catch((e) => {
            if (!controller.signal.aborted && sequence === request.current)
              setError(e instanceof Error ? e.message : 'Não foi possível carregar os cadastros.');
          })
          .finally(() => {
            if (!controller.signal.aborted && sequence === request.current) setLoading(false);
          });
      },
      query ? 250 : 0
    );
    return () => {
      window.clearTimeout(timeout);
      controller.abort();
      request.current++;
    };
  }, [company?.id, page, query, revision, role, status]);
  function saved(contact: Contact) {
    setEditor(null);
    setNotice(`${contact.name}: cadastro salvo.`);
    setRevision((value) => value + 1);
  }
  const pages = Math.max(1, Math.ceil((result?.total ?? 0) / 20));
  return (
    <>
      <div className="page-heading">
        <div>
          <span className="eyebrow">RELACIONAMENTOS</span>
          <h1>{title}</h1>
          <p className="subtle">
            {customer
              ? 'Pessoas e empresas que fazem parte do seu negócio.'
              : 'Quem ajuda seu negócio a acontecer.'}
          </p>
        </div>
        <button
          className="button primary"
          onClick={() => {
            setNotice('');
            setEditor({ contact: null });
          }}
        >
          <Plus size={19} />
          {customer ? 'Novo cliente' : 'Novo fornecedor'}
        </button>
      </div>
      {notice && (
        <div className="notice" role="status">
          <CheckCircle2 size={19} />
          <span>{notice}</span>
          <button className="icon-button" aria-label="Fechar mensagem" onClick={() => setNotice('')}>
            <X size={16} />
          </button>
        </div>
      )}
      <section className="contacts-panel" aria-label={`Lista de ${title.toLowerCase()}`}>
        <div className="list-toolbar">
          <label className="search-field">
            <Search size={19} />
            <input
              aria-label="Pesquisar cadastros"
              type="search"
              placeholder="Buscar por nome, documento ou contato"
              maxLength={100}
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="status-filter">
            <span>Situação</span>
            <select
              aria-label="Situação dos cadastros"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
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
              <Icon size={30} strokeWidth={1.5} />
            </div>
            <h2>
              {query || status !== 'active'
                ? 'Nenhum cadastro encontrado'
                : customer
                  ? 'Seu próximo bom relacionamento começa aqui'
                  : 'Seus parceiros de negócio, em um só lugar'}
            </h2>
            <p>
              {query || status !== 'active'
                ? 'Ajuste a busca ou a situação para encontrar o cadastro.'
                : `Adicione seu primeiro ${customer ? 'cliente' : 'fornecedor'}. Para começar, basta o nome.`}
            </p>
            {!query && status === 'active' && (
              <button className="button" onClick={() => setEditor({ contact: null })}>
                <Plus size={17} />
                {customer ? 'Cadastrar cliente' : 'Cadastrar fornecedor'}
              </button>
            )}
            {page > 1 && (
              <button className="button" onClick={() => setPage(1)}>
                Voltar à primeira página
              </button>
            )}
          </div>
        ) : (
          <>
            <table className="contacts-table">
              <thead>
                <tr>
                  <th>Nome</th>
                  <th>Contato</th>
                  <th>Relacionamento</th>
                  <th>Situação</th>
                  <th>
                    <span className="sr-only">Ações</span>
                  </th>
                </tr>
              </thead>
              <tbody>
                {result.items.map((contact) => (
                  <tr key={contact.id}>
                    <td className="contact-name">
                      <span className="contact-avatar" aria-hidden="true">
                        {contact.name[0].toUpperCase()}
                      </span>
                      <span>
                        <button className="name-button" onClick={() => setEditor({ contact })}>
                          {contact.name}
                        </button>
                        <small>
                          {contact.document ||
                            (contact.personType === 'BUSINESS' ? 'Pessoa jurídica' : 'Pessoa física')}
                        </small>
                      </span>
                    </td>
                    <td data-label="Contato">
                      <span>{contact.phone || '—'}</span>
                      <small>{contact.email}</small>
                    </td>
                    <td data-label="Relacionamento">
                      <span className="role-badge">
                        {contact.isCustomer && contact.isSupplier
                          ? 'Cliente e fornecedor'
                          : contact.isCustomer
                            ? 'Cliente'
                            : 'Fornecedor'}
                      </span>
                    </td>
                    <td data-label="Situação">
                      <span className={`status-badge ${contact.active ? '' : 'inactive'}`}>
                        <span />
                        {contact.active ? 'Ativo' : 'Inativo'}
                      </span>
                    </td>
                    <td className="row-action">
                      <button
                        className="icon-button"
                        aria-label={`Editar ${contact.name}`}
                        onClick={() => setEditor({ contact })}
                      >
                        <Pencil size={17} />
                      </button>
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
                  onClick={() => setPage((value) => value - 1)}
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
                  onClick={() => setPage((value) => value + 1)}
                >
                  <ArrowRight size={17} />
                </button>
              </div>
            </footer>
          </>
        )}
      </section>
      <p className="page-note">
        Um mesmo cadastro pode ser cliente e fornecedor. As informações ficam reunidas.
      </p>
      {editor && company && (
        <ContactForm
          contact={editor.contact}
          role={role}
          companyId={company.id}
          onClose={() => {
            setEditor(null);
            setRevision((value) => value + 1);
          }}
          onSaved={saved}
        />
      )}
    </>
  );
}
