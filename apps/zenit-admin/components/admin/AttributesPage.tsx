import { useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  AttributeApi,
  AttributeEditor,
  attributeError,
  attributeFilters,
  AttributeList,
  ProductAttribute
} from '@zenit/product-attributes';
import api from '@/lib/api';
import { DashboardLayout } from '@/components/layout/DashboardLayout';
import { AccessGuard } from '@/components/ui/AccessGuard';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { useFormNavigation } from '@/contexts/FormNavigationContext';
import { useToast } from '@/components/ui/ToastContext';

const call: AttributeApi = async (path, options) => {
  try {
    const response = await api.request({
      url: `/admin/product-attributes${path}`,
      method: options?.method || 'GET',
      data: options?.body ? JSON.parse(options.body) : undefined,
      signal: options?.signal
    });
    return response.data;
  } catch (cause: any) {
    throw new Error(cause.response?.data?.error || 'Não foi possível concluir a operação.');
  }
};
export function AttributesPage({ mode = 'list' }: { mode?: 'list' | 'new' | 'edit' }) {
  const router = useRouter();
  const { protect, request, complete } = useFormNavigation();
  const { addToast } = useToast();
  const filters = attributeFilters(router.query);
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const key = `${id}:${mode}`;
  const [loaded, setLoaded] = useState<{ key: string; item: ProductAttribute } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    if (mode !== 'edit' || !id || !router.isReady) return;
    const controller = new AbortController();
    setLoaded(null);
    setError('');
    void call<ProductAttribute>(`/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((item) => {
        if (!controller.signal.aborted) setLoaded({ key, item });
      })
      .catch((cause) => {
        if (!controller.signal.aborted) setError(attributeError(cause));
      });
    return () => controller.abort();
  }, [key, retry, router.isReady]);
  const listPath = '/admin/product-attributes';
  const back = () => {
    void router.push({ pathname: listPath, query: { ...filters } });
  };
  return (
    <DashboardLayout title="Características">
      <Breadcrumb
        items={[
          { label: 'Início', href: '/' },
          {
            label: 'Características',
            ...(mode !== 'list'
              ? { href: `${listPath}?${new URLSearchParams({ ...filters })}` }
              : {})
          },
          ...(mode !== 'list'
            ? [{ label: mode === 'new' ? 'Nova característica' : 'Editar característica' }]
            : [])
        ]}
      />
      <AccessGuard allowedRoles={['ADMIN']}>
        {router.isReady &&
          (mode === 'list' ? (
            <AttributeList
              api={call}
              platform
              filters={filters}
              change={(query) => {
                void router.replace({ pathname: listPath, query: { ...query } }, undefined, {
                  shallow: true
                });
              }}
              open={(target) => {
                void router.push({ pathname: `${listPath}/${target}`, query: { ...filters } });
              }}
            />
          ) : error ? (
            <div className="admin-empty">
              <p role="alert">{error}</p>
              <button className="admin-button" onClick={() => setRetry(retry + 1)}>
                Tentar novamente
              </button>
              <button className="admin-button" onClick={back}>
                Voltar
              </button>
            </div>
          ) : mode === 'edit' && loaded?.key !== key ? (
            <p role="status">Carregando característica…</p>
          ) : (
            <AttributeEditor
              key={key}
              item={mode === 'edit' ? loaded!.item : null}
              platform
              api={call}
              protect={protect}
              back={() => request(back)}
              saved={() => {
                addToast('Característica salva.', 'success');
                complete(back);
              }}
            />
          ))}
      </AccessGuard>
    </DashboardLayout>
  );
}
