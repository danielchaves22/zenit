import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { useNavigation } from '@/contexts/NavigationContext';
import { api } from '@/lib/api';
import { Contact } from '@/lib/types';

type Draft = Pick<
  Contact,
  | 'name'
  | 'personType'
  | 'isCustomer'
  | 'isSupplier'
  | 'document'
  | 'email'
  | 'phone'
  | 'notes'
  | 'active'
>;
export function ContactForm({
  contact,
  role,
  companyId,
  onClose,
  onSaved
}: {
  contact: Contact | null;
  role: 'customer' | 'supplier';
  companyId: number;
  onClose: () => void;
  onSaved: (contact: Contact) => void;
}) {
  const initial: Draft = {
    name: contact?.name ?? '',
    personType: contact?.personType ?? 'PERSON',
    isCustomer: contact?.isCustomer ?? role === 'customer',
    isSupplier: contact?.isSupplier ?? role === 'supplier',
    document: contact?.document ?? '',
    email: contact?.email ?? '',
    phone: contact?.phone ?? '',
    notes: contact?.notes ?? '',
    active: contact?.active ?? true
  };
  const [draft, setDraft] = useState(initial);
  const original = useRef(JSON.stringify(initial));
  const requestKey = useRef('');
  const { protect, complete } = useNavigation();
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [discard, setDiscard] = useState(false);
  useEffect(() => {
    requestKey.current = crypto.randomUUID();
  }, []);
  const dirty = JSON.stringify(draft) !== original.current;
  useEffect(() => {
    protect(dirty, busy);
    return () => protect(false, false);
  }, [dirty, busy, protect]);
  function close() {
    if (saving.current) return;
    if (JSON.stringify(draft) !== original.current) setDiscard(true);
    else onClose();
  }
  function update<K extends keyof Draft>(field: K, value: Draft[K]) {
    setDraft((current) => ({ ...current, [field]: value }));
  }
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    if (!draft.isCustomer && !draft.isSupplier) {
      setError('Selecione cliente, fornecedor ou ambos.');
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    try {
      const result = await api<Contact>(
        contact ? `/bizz/contacts/${contact.id}` : '/bizz/contacts',
        {
          companyId,
          method: contact ? 'PUT' : 'POST',
          body: JSON.stringify({
            ...draft,
            ...(contact ? { version: contact.version } : { requestKey: requestKey.current })
          })
        }
      );
      original.current = JSON.stringify(draft);
      protect(false, false);
      onSaved(result);
    } catch (e) {
      setError(
        e instanceof Error ? e.message : 'Não foi possível salvar. Seus dados continuam aqui.'
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const title = contact
    ? 'Editar cadastro'
    : role === 'customer'
      ? 'Novo cliente'
      : 'Novo fornecedor';
  return (
    <div className="contact-editor">
      <div className="page-heading editor-heading">
        <button type="button" className="button" onClick={close} disabled={busy}>
          <ArrowLeft size={18} /> Voltar
        </button>
        <h1>{title}</h1>
      </div>
      <section className="contact-form-panel" aria-label={title}>
        {discard ? (
          <div className="discard-panel">
            <h3>Descartar alterações?</h3>
            <p>Você tem informações que ainda não foram salvas.</p>
            <div className="dialog-actions">
              <button className="button" onClick={() => setDiscard(false)}>
                Continuar editando
              </button>
              <button className="button danger" onClick={() => complete(onClose)}>
                Descartar
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={save}>
            <fieldset disabled={busy} className="contact-form-body stack">
              <label>
                <span>
                  Nome ou razão social <span className="required">*</span>
                </span>
                <input
                  autoFocus
                  required
                  maxLength={160}
                  value={draft.name}
                  onChange={(e) => update('name', e.target.value)}
                />
              </label>
              <fieldset className="role-field">
                <legend>
                  Este cadastro é <span className="required">*</span>
                </legend>
                <div className="role-options">
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.isCustomer}
                      onChange={(e) => update('isCustomer', e.target.checked)}
                    />{' '}
                    Cliente
                  </label>
                  <label>
                    <input
                      type="checkbox"
                      checked={draft.isSupplier}
                      onChange={(e) => update('isSupplier', e.target.checked)}
                    />{' '}
                    Fornecedor
                  </label>
                </div>
              </fieldset>
              <div className="form-grid">
                <label>
                  Telefone
                  <input
                    type="tel"
                    autoComplete="tel"
                    maxLength={40}
                    value={draft.phone ?? ''}
                    onChange={(e) => update('phone', e.target.value)}
                    placeholder="(00) 00000-0000"
                  />
                </label>
                <label>
                  E-mail
                  <input
                    type="email"
                    autoComplete="email"
                    maxLength={254}
                    value={draft.email ?? ''}
                    onChange={(e) => update('email', e.target.value)}
                    placeholder="contato@empresa.com.br"
                  />
                </label>
              </div>
              <details
                open={Boolean(
                  contact?.document || contact?.notes || contact?.personType === 'BUSINESS'
                )}
              >
                <summary>
                  Mais informações <span className="subtle">(opcional)</span>
                </summary>
                <div className="stack details-content">
                  <div className="form-grid">
                    <label>
                      Tipo de pessoa
                      <select
                        value={draft.personType}
                        onChange={(e) =>
                          update('personType', e.target.value as Draft['personType'])
                        }
                      >
                        <option value="PERSON">Pessoa física</option>
                        <option value="BUSINESS">Pessoa jurídica</option>
                      </select>
                    </label>
                    <label>
                      CPF ou CNPJ
                      <input
                        maxLength={32}
                        value={draft.document ?? ''}
                        onChange={(e) => update('document', e.target.value)}
                      />
                    </label>
                  </div>
                  <label>
                    Observações
                    <textarea
                      rows={3}
                      maxLength={2000}
                      value={draft.notes ?? ''}
                      onChange={(e) => update('notes', e.target.value)}
                    />
                  </label>
                </div>
              </details>
              {contact && (
                <label className="active-field">
                  <input
                    type="checkbox"
                    checked={draft.active}
                    onChange={(e) => update('active', e.target.checked)}
                  />
                  <span>
                    Cadastro ativo<small>Ao inativar, o histórico é preservado.</small>
                  </span>
                </label>
              )}
              {error && (
                <p className="form-error" role="alert">
                  {error}
                </p>
              )}
            </fieldset>
            <div className="dialog-actions">
              <button type="button" className="button" disabled={busy} onClick={close}>
                Cancelar
              </button>
              <button className="button primary" disabled={busy}>
                <Check size={18} />
                {busy ? 'Salvando…' : 'Salvar'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
