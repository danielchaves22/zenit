import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Check } from 'lucide-react';
import { useNavigation } from '@/contexts/NavigationContext';
import { api } from '@/lib/api';
import { CatalogItem, CatalogKind, parseSalePrice } from '@/lib/catalog';

export function CatalogItemForm({
  item,
  kind = 'PRODUCT',
  usage = 'both',
  companyId,
  onClose,
  onSaved
}: {
  item: CatalogItem | null;
  kind?: CatalogKind;
  usage?: string;
  companyId: number;
  onClose: () => void;
  onSaved: (item: CatalogItem) => void;
}) {
  const [draft, setDraft] = useState(() => ({
    name: item?.name ?? '',
    kind: item?.kind ?? kind,
    unit: item?.unit ?? (kind === 'SERVICE' ? 'Serviço' : 'Unidade'),
    usage: item
      ? item.canPurchase && item.canSell
        ? 'both'
        : item.canPurchase
          ? 'purchase'
          : 'sale'
      : usage === 'all'
        ? 'both'
        : usage,
    price: item?.salePrice?.replace('.', ',') ?? '',
    active: item?.active ?? true
  }));
  const original = useRef(JSON.stringify(draft));
  const requestKey = useRef('');
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [priceError, setPriceError] = useState('');
  const priceInput = useRef<HTMLInputElement>(null);
  const { protect, request } = useNavigation();
  useEffect(() => {
    requestKey.current = crypto.randomUUID();
  }, []);
  const dirty = JSON.stringify(draft) !== original.current;
  useEffect(() => {
    protect(dirty, busy);
    return () => protect(false, false);
  }, [dirty, busy, protect]);
  const update = <K extends keyof typeof draft>(field: K, value: (typeof draft)[K]) =>
    setDraft((current) => ({ ...current, [field]: value }));
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    let salePrice: string | null;
    try {
      salePrice = parseSalePrice(draft.price);
    } catch (cause) {
      setPriceError((cause as Error).message);
      priceInput.current?.focus();
      return;
    }
    saving.current = true;
    setBusy(true);
    setError('');
    setPriceError('');
    try {
      const result = await api<CatalogItem>(item ? `/bizz/catalog/${item.id}` : '/bizz/catalog', {
        companyId,
        method: item ? 'PUT' : 'POST',
        body: JSON.stringify({
          name: draft.name,
          kind: draft.kind,
          unit: draft.unit,
          canPurchase: draft.usage !== 'sale',
          canSell: draft.usage !== 'purchase',
          salePrice,
          active: draft.active,
          ...(item ? { version: item.version } : { requestKey: requestKey.current })
        })
      });
      original.current = JSON.stringify(draft);
      protect(false, false);
      onSaved(result);
    } catch (cause) {
      setError(
        cause instanceof Error
          ? cause.message
          : 'Não foi possível salvar. Seus dados continuam aqui.'
      );
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  const title = item ? 'Editar cadastro' : 'Novo cadastro';
  return (
    <div className="contact-editor">
      <div className="page-heading editor-heading">
        <button className="button" type="button" disabled={busy} onClick={() => request(onClose)}>
          <ArrowLeft size={18} /> Voltar
        </button>
        <h1>{title}</h1>
      </div>
      <section className="contact-form-panel" aria-label={title}>
        <form onSubmit={save}>
          <fieldset className="contact-form-body stack" disabled={busy}>
            <label>
              <span>
                Nome <span className="required">*</span>
              </span>
              <input
                autoFocus
                required
                maxLength={160}
                value={draft.name}
                onChange={(event) => update('name', event.target.value)}
              />
            </label>
            <div className="form-grid">
              <label>
                Tipo
                <select
                  value={draft.kind}
                  onChange={(event) => {
                    const next = event.target.value as CatalogKind;
                    setDraft((current) => ({
                      ...current,
                      kind: next,
                      unit:
                        current.unit === (current.kind === 'SERVICE' ? 'Serviço' : 'Unidade')
                          ? next === 'SERVICE'
                            ? 'Serviço'
                            : 'Unidade'
                          : current.unit
                    }));
                  }}
                >
                  <option value="PRODUCT">Produto</option>
                  <option value="SERVICE">Serviço</option>
                </select>
              </label>
              <label>
                <span>
                  Unidade <span className="required">*</span>
                </span>
                <input
                  required
                  maxLength={40}
                  list="catalog-units"
                  value={draft.unit}
                  onChange={(event) => update('unit', event.target.value)}
                />
                <datalist id="catalog-units">
                  {[
                    'Unidade',
                    'Pacote',
                    'Caixa',
                    'Quilograma',
                    'Grama',
                    'Litro',
                    'Metro',
                    'Metro quadrado',
                    'Hora',
                    'Diária',
                    'Serviço'
                  ].map((unit) => (
                    <option key={unit} value={unit} />
                  ))}
                </datalist>
              </label>
              <label>
                Utilização
                <select
                  value={draft.usage}
                  onChange={(event) => update('usage', event.target.value)}
                >
                  <option value="both">Compra e venda</option>
                  <option value="purchase">Compra</option>
                  <option value="sale">Venda</option>
                </select>
              </label>
              <label>
                <span id="catalog-price-label">
                  Preço de venda (R$) <span className="subtle">(opcional)</span>
                </span>
                <input
                  ref={priceInput}
                  inputMode="decimal"
                  maxLength={18}
                  placeholder="0,00"
                  value={draft.price}
                  aria-labelledby="catalog-price-label"
                  aria-invalid={Boolean(priceError)}
                  aria-describedby={priceError ? 'catalog-price-error' : undefined}
                  onChange={(event) => {
                    update('price', event.target.value);
                    setPriceError('');
                  }}
                />
                {priceError && (
                  <span className="form-error" role="alert" id="catalog-price-error">
                    {priceError}
                  </span>
                )}
              </label>
            </div>
            {item && (
              <label className="active-field">
                <input
                  type="checkbox"
                  checked={draft.active}
                  onChange={(event) => update('active', event.target.checked)}
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
            <button
              type="button"
              className="button"
              disabled={busy}
              onClick={() => request(onClose)}
            >
              Cancelar
            </button>
            <button className="button primary" disabled={busy}>
              <Check size={18} />
              {busy ? 'Salvando…' : 'Salvar'}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
