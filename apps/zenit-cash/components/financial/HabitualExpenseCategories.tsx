import React, { useEffect, useState } from 'react';
import { Button } from '@/components/ui/Button';
import { Modal } from '@/components/ui/Modal';
import {
  getHabitualExpensePreference,
  saveHabitualExpensePreference,
  HabitualExpensePreference
} from '@/lib/habitual-expenses';

export default function HabitualExpenseCategories({ onSaved }: { onSaved: () => void }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<HabitualExpensePreference | null>(null);
  const [selected, setSelected] = useState<number[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setData(null);
    setSearch('');
    getHabitualExpensePreference()
      .then((value) => {
        if (!cancelled) {
          setData(value);
          setSelected(value.categoryIds);
        }
      })
      .catch(() => {
        if (!cancelled)
          setError('Não foi possível carregar as categorias. Feche e tente novamente.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);
  async function save() {
    setLoading(true);
    setError(null);
    try {
      await saveHabitualExpensePreference(selected);
      setOpen(false);
      onSaved();
    } catch (reason: any) {
      setError(
        reason.response?.data?.error || 'Não foi possível salvar. Suas escolhas continuam aqui.'
      );
    } finally {
      setLoading(false);
    }
  }
  const categoryName = (id: number) => data?.categories.find((item) => item.id === id)?.name;
  const label = (item: NonNullable<typeof data>['categories'][number]) =>
    item.parentId
      ? (categoryName(item.parentId) ? categoryName(item.parentId) + ' / ' : '') + item.name
      : item.name;
  return (
    <>
      <Button variant="outline" onClick={() => setOpen(true)}>
        Gerenciar categorias
      </Button>
      <Modal
        isOpen={open}
        onClose={() => {
          if (!loading) setOpen(false);
        }}
        title="Categorias de gastos habituais"
        loading={loading}
        footer={
          <div className="flex flex-wrap justify-end gap-3">
            <Button variant="outline" disabled={loading} onClick={() => setOpen(false)}>
              Cancelar
            </Button>
            {data?.access.canManage && (
              <Button disabled={loading} onClick={() => void save()}>
                Salvar categorias habituais
              </Button>
            )}
          </div>
        }
      >
        <div className="max-h-[55vh] space-y-4 overflow-y-auto pr-1">
          <p className="text-sm text-gray-300">
            Esta seleção fica salva neste espaço financeiro e orienta as estimativas nas análises e
            nos planejamentos. Não altera despesas registradas nem limites de orçamento.
          </p>
          <p className="text-xs text-gray-400">
            Cada marcação inclui os lançamentos diretamente nessa categoria, em contas e cartões.
            Selecione também as subcategorias que deseja estimar.
          </p>
          {error && (
            <p role="alert" className="text-red-300">
              {error}
            </p>
          )}
          {loading && <p role="status">Carregando…</p>}
          {data && (
            <>
              {!data.access.canManage && (
                <p className="text-sm text-gray-400">
                  Somente gestores podem alterar esta configuração compartilhada.
                </p>
              )}
              <label className="block text-sm text-gray-200">
                Buscar categoria
                <input
                  className="mt-2 w-full rounded border border-gray-700 bg-background p-2"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                />
              </label>
              <p className="text-xs text-gray-400">
                {selected.length} categoria(s) selecionada(s). Uma seleção vazia desativa as
                estimativas habituais.
              </p>
              <fieldset
                disabled={loading || !data.access.canManage}
                className="max-h-72 space-y-2 overflow-y-auto"
              >
                {data.categories
                  .filter((item) =>
                    label(item)
                      .toLocaleLowerCase('pt-BR')
                      .includes(search.toLocaleLowerCase('pt-BR'))
                  )
                  .map((item) => (
                    <label
                      key={item.id}
                      className="flex items-start gap-3 rounded p-2 text-sm text-gray-200"
                    >
                      <input
                        type="checkbox"
                        checked={selected.includes(item.id)}
                        className="mt-1 accent-blue-500"
                        onChange={(event) =>
                          setSelected((ids) =>
                            event.target.checked
                              ? [...ids, item.id]
                              : ids.filter((id) => id !== item.id)
                          )
                        }
                      />
                      <span className="break-words">{label(item)}</span>
                    </label>
                  ))}
              </fieldset>
            </>
          )}
        </div>
      </Modal>
    </>
  );
}
