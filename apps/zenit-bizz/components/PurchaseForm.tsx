import { FormEvent, useEffect, useRef, useState } from 'react';
import { ArrowLeft, Plus, Trash2 } from 'lucide-react';
import { useNavigation } from '@/contexts/NavigationContext';
import { api } from '@/lib/api';
import { formatSalePrice } from '@/lib/catalog';
import {
  decimalInput,
  displayDate,
  installmentPreview,
  lineTotal,
  moneyFromCents,
  Purchase,
  PurchaseOptions,
  today
} from '@/lib/purchases';
import { LookupItem, PurchaseLookup } from './PurchaseLookup';

type Line = { key: number; item: LookupItem | null; quantity: string; unitPrice: string };
export function PurchaseForm({
  companyId,
  options,
  onBack,
  onSaved
}: {
  companyId: number;
  options: PurchaseOptions;
  onBack: () => void;
  onSaved: (purchase: Purchase) => void;
}) {
  const [supplier, setSupplier] = useState<LookupItem | null>(null);
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [firstDueDate, setFirstDueDate] = useState(today);
  const [count, setCount] = useState('1');
  const [account, setAccount] = useState(String(options.accounts[0]?.id ?? ''));
  const [category, setCategory] = useState(
    String(options.categories.find((item) => item.isDefault)?.id ?? '')
  );
  const [notes, setNotes] = useState('');
  const [lines, setLines] = useState<Line[]>([
    { key: 0, item: null, quantity: '1', unitPrice: '' }
  ]);
  const nextKey = useRef(1);
  const key = useRef('');
  const saving = useRef(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const { protect, request } = useNavigation();
  const draft = JSON.stringify({
    supplier,
    purchaseDate,
    firstDueDate,
    count,
    account,
    category,
    notes,
    lines
  });
  const original = useRef(draft);
  useEffect(() => {
    key.current = crypto.randomUUID();
  }, []);
  useEffect(() => {
    protect(draft !== original.current, busy);
    return () => protect(false, false);
  }, [draft, busy, protect]);
  const totals = lines.map((line) => {
    try {
      return lineTotal(line.quantity, line.unitPrice);
    } catch {
      return BigInt(0);
    }
  });
  const total = totals.reduce((sum, item) => sum + item, BigInt(0));
  const installments = installmentPreview(total, Number(count), firstDueDate);
  const updateLine = (lineKey: number, values: Partial<Line>) =>
    setLines((current) =>
      current.map((line) => (line.key === lineKey ? { ...line, ...values } : line))
    );
  async function save(event: FormEvent) {
    event.preventDefault();
    if (saving.current) return;
    setError('');
    try {
      if (!supplier) throw new Error('Selecione um fornecedor da lista.');
      const items = lines.map((line) => {
        if (!line.item) throw new Error('Selecione um produto ou serviço da lista para cada item.');
        if (lineTotal(line.quantity, line.unitPrice) < BigInt(1))
          throw new Error('Cada item deve ter um total de ao menos R$ 0,01.');
        return {
          catalogItemId: line.item.id,
          quantity: decimalInput(line.quantity, 3, 8).text,
          unitPrice: decimalInput(line.unitPrice, 2, 10).text
        };
      });
      if (total >= BigInt('100000000000000') || !installments.length)
        throw new Error('Confira o total e a quantidade de parcelas.');
      saving.current = true;
      setBusy(true);
      const purchase = await api<Purchase>('/bizz/purchases', {
        method: 'POST',
        companyId,
        body: JSON.stringify({
          requestKey: key.current,
          supplierId: supplier.id,
          date: purchaseDate,
          items,
          notes,
          fromAccountId: Number(account),
          categoryId: category ? Number(category) : null,
          installmentCount: Number(count),
          firstDueDate
        })
      });
      original.current = draft;
      protect(false, false);
      onSaved(purchase);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Não foi possível registrar a compra.');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }
  return (
    <div className="purchase-editor">
      <div className="page-heading editor-heading">
        <button type="button" className="button" disabled={busy} onClick={() => request(onBack)}>
          <ArrowLeft size={18} />
          Voltar
        </button>
        <h1>Nova compra</h1>
      </div>
      <form onSubmit={save} className="contact-form-panel">
        <fieldset className="contact-form-body stack" disabled={busy}>
          <div className="form-grid">
            <PurchaseLookup
              label="Fornecedor"
              path="/bizz/contacts?role=supplier&status=active"
              companyId={companyId}
              value={supplier}
              onChange={setSupplier}
            />
            <label>
              Data da compra
              <input
                required
                type="date"
                min="2000-01-01"
                max="2100-12-31"
                value={purchaseDate}
                onChange={(event) => setPurchaseDate(event.target.value)}
              />
            </label>
          </div>
          <section aria-labelledby="purchase-items-title" className="purchase-section">
            <h2 id="purchase-items-title">Itens</h2>
            <div className="purchase-lines">
              {lines.map((line, index) => (
                <div className="purchase-line" key={line.key}>
                  <PurchaseLookup
                    label={`Produto ou serviço ${index + 1}`}
                    path="/bizz/catalog?usage=purchase&status=active"
                    companyId={companyId}
                    value={line.item}
                    onChange={(item) => updateLine(line.key, { item })}
                  />
                  <label>
                    Quantidade{line.item?.unit && <small>{line.item.unit}</small>}
                    <input
                      required
                      inputMode="decimal"
                      aria-label={`Quantidade do item ${index + 1}`}
                      value={line.quantity}
                      onChange={(event) => updateLine(line.key, { quantity: event.target.value })}
                    />
                  </label>
                  <label>
                    Valor unitário
                    <input
                      required
                      inputMode="decimal"
                      aria-label={`Valor unitário do item ${index + 1}`}
                      value={line.unitPrice}
                      placeholder="0,00"
                      onChange={(event) => updateLine(line.key, { unitPrice: event.target.value })}
                    />
                  </label>
                  <div className="purchase-line-total">
                    <span>Total</span>
                    <strong>{formatSalePrice(moneyFromCents(totals[index]))}</strong>
                  </div>
                  <button
                    type="button"
                    className="icon-button"
                    disabled={lines.length === 1}
                    aria-label={`Remover item ${index + 1}`}
                    onClick={() =>
                      setLines((current) => current.filter((item) => item.key !== line.key))
                    }
                  >
                    <Trash2 size={18} />
                  </button>
                </div>
              ))}
            </div>
            <div className="purchase-total-row">
              <button
                type="button"
                className="button"
                disabled={lines.length >= 100}
                onClick={() =>
                  setLines((current) => [
                    ...current,
                    { key: nextKey.current++, item: null, quantity: '1', unitPrice: '' }
                  ])
                }
              >
                <Plus size={18} />
                Adicionar item
              </button>
              <span>
                Total da compra <strong>{formatSalePrice(moneyFromCents(total))}</strong>
              </span>
            </div>
          </section>
          <section className="purchase-section" aria-labelledby="purchase-finance-title">
            <h2 id="purchase-finance-title">Pagamento</h2>
            <div className="form-grid">
              <label>
                Conta prevista
                <select
                  required
                  value={account}
                  onChange={(event) => setAccount(event.target.value)}
                >
                  <option value="">Selecione</option>
                  {options.accounts.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Categoria
                <select value={category} onChange={(event) => setCategory(event.target.value)}>
                  <option value="">Sem categoria</option>
                  {options.categories.map((item) => (
                    <option value={item.id} key={item.id}>
                      {item.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Parcelas mensais
                <input
                  type="number"
                  required
                  min="1"
                  max="60"
                  step="1"
                  value={count}
                  onChange={(event) => setCount(event.target.value)}
                />
              </label>
              <label>
                {Number(count) > 1 ? 'Primeiro vencimento' : 'Vencimento'}
                <input
                  required
                  type="date"
                  min="2000-01-01"
                  max="2095-12-31"
                  value={firstDueDate}
                  onChange={(event) => setFirstDueDate(event.target.value)}
                />
              </label>
            </div>
            {installments.length > 0 && (
              <div className="installment-preview" aria-label="Prévia das parcelas">
                <table className="purchase-table">
                  <thead>
                    <tr>
                      <th>Parcela</th>
                      <th>Vencimento</th>
                      <th>Valor</th>
                    </tr>
                  </thead>
                  <tbody>
                    {installments.map((item) => (
                      <tr key={item.number}>
                        <td>
                          {item.number}/{installments.length}
                        </td>
                        <td>{displayDate(item.dueDate)}</td>
                        <td>{formatSalePrice(item.amount)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <label>
            Observação <span className="subtle">(opcional)</span>
            <textarea
              rows={3}
              maxLength={2000}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
            />
          </label>
          {error && (
            <p className="form-error" role="alert">
              {error}
            </p>
          )}
        </fieldset>
        <div className="dialog-actions">
          <button type="button" className="button" disabled={busy} onClick={() => request(onBack)}>
            Cancelar
          </button>
          <button className="button primary" type="submit" disabled={busy}>
            {busy ? 'Registrando…' : 'Confirmar compra'}
          </button>
        </div>
      </form>
    </div>
  );
}
