import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { useNavigation } from '@/contexts/NavigationContext';
import { api } from '@/lib/api';
import { Contact } from '@/lib/types';
import { AddressDraft, addressPayload, initialAddresses } from '@/lib/contact-addresses';
import { Relationship } from '@/lib/contact-filters';
import { RelationshipSelect } from './RelationshipSelect';
import { ContactValues } from './ContactValues';
import { MaskedContactInput } from './MaskedContactInput';
import { ContactAddresses } from './ContactAddresses';

type Draft = Pick<
  Contact,
  'name' | 'personType' | 'isCustomer' | 'isSupplier' | 'document' | 'notes' | 'active'
> & { phones: string[]; emails: string[]; addresses: AddressDraft[] };
function initialValues(values: string[] | undefined, legacy: string | null | undefined) {
  const current = values ?? (legacy ? [legacy] : []);
  return current.length ? current : [''];
}
export function ContactForm({
  contact,
  role = 'all',
  personType = 'PERSON',
  companyId,
  onClose,
  onSaved
}: {
  contact: Contact | null;
  role?: Relationship;
  personType?: 'PERSON' | 'BUSINESS';
  companyId: number;
  onClose: () => void;
  onSaved: (contact: Contact) => void;
}) {
  const initial: Draft = {
    name: contact?.name ?? '',
    personType: contact?.personType ?? personType,
    isCustomer: contact?.isCustomer ?? (role === 'customer' || role === 'both'),
    isSupplier: contact?.isSupplier ?? (role === 'supplier' || role === 'both'),
    document: contact?.document ?? '',
    emails: initialValues(contact?.emails, contact?.email),
    phones: initialValues(contact?.phones, contact?.phone),
    addresses: initialAddresses(contact),
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
            addresses: draft.addresses.map(addressPayload),
            phones: draft.phones.map((value) => value.trim()).filter(Boolean),
            emails: draft.emails.map((value) => value.trim()).filter(Boolean),
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
  const title = contact ? 'Editar cadastro' : 'Novo cadastro';
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
                  {draft.personType === 'PERSON' ? 'CPF' : 'CNPJ'}
                  <MaskedContactInput
                    maxLength={32}
                    mask={draft.personType === 'PERSON' ? 'cpf' : 'cnpj'}
                    inputMode={draft.personType === 'PERSON' ? 'numeric' : 'text'}
                    value={draft.document ?? ''}
                    onChange={(value) => update('document', value)}
                  />
                </label>
              </div>
              <RelationshipSelect value={draft} onChange={update} disabled={busy} />
              <div className="form-grid">
                <ContactValues
                  kind="phone"
                  values={draft.phones}
                  onChange={(values) => update('phones', values)}
                />
                <ContactValues
                  kind="email"
                  values={draft.emails}
                  onChange={(values) => update('emails', values)}
                />
              </div>
              <ContactAddresses
                values={draft.addresses}
                onChange={(values) => update('addresses', values)}
                companyId={companyId}
                disabled={busy}
              />
              <details open={Boolean(contact?.notes)}>
                <summary>
                  Observações <span className="subtle">(opcional)</span>
                </summary>
                <div className="details-content">
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
                    Cadastro ativo
                    <small>Ao inativar, o histórico é preservado.</small>
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
