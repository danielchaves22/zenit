import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/router';
import {
  AttributeApi,
  AttributeEditor,
  attributeError,
  attributeFilters,
  AttributeList,
  ProductAttribute
} from '@zenit/product-attributes';
import { api } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigation } from '@/contexts/NavigationContext';
import { Layout } from './Layout';

export function AttributesPage({ mode = 'list' }: { mode?: 'list' | 'new' | 'edit' }) {
  const router = useRouter();
  const { company } = useAuth();
  const { protect, request, complete, notice, setNotice } = useNavigation();
  const filters = attributeFilters(router.query);
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const key = `${company?.id}:${id}:${mode}`;
  const [loaded, setLoaded] = useState<{ key: string; item: ProductAttribute } | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const call = useCallback<AttributeApi>(
    (path, options) => api(`/bizz/attributes${path}`, { ...options, companyId: company?.id }),
    [company?.id]
  );
  useEffect(() => {
    if (mode !== 'edit' || !id || !company || !router.isReady) return;
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
  }, [call, key, retry, router.isReady]);
  const back = () => {
    void router.push({ pathname: '/caracteristicas', query: { ...filters } });
  };
  return (
    <Layout
      breadcrumbs={[
        { label: 'Cadastros' },
        {
          label: 'Características',
          ...(mode !== 'list'
            ? { href: { pathname: '/caracteristicas', query: { ...filters } } }
            : {})
        },
        ...(mode !== 'list'
          ? [{ label: mode === 'new' ? 'Nova característica' : 'Editar característica' }]
          : [])
      ]}
    >
      {company &&
        router.isReady &&
        (mode === 'list' ? (
          <>
            {notice && (
              <p role="status" className="success-notice">
                {notice}
              </p>
            )}
            <AttributeList
              key={company.id}
              api={call}
              platform={false}
              filters={filters}
              change={(query) => {
                void router.replace(
                  { pathname: '/caracteristicas', query: { ...query } },
                  undefined,
                  { shallow: true }
                );
              }}
              open={(target) => {
                setNotice('');
                void router.push({
                  pathname:
                    target === 'new' ? '/caracteristicas/nova' : `/caracteristicas/${target}`,
                  query: { ...filters }
                });
              }}
            />
          </>
        ) : error ? (
          <div className="list-state">
            <p role="alert">{error}</p>
            <button className="button" onClick={() => setRetry(retry + 1)}>
              Tentar novamente
            </button>
            <button className="button" onClick={back}>
              Voltar
            </button>
          </div>
        ) : mode === 'edit' && loaded?.key !== key ? (
          <p role="status">Carregando característica…</p>
        ) : (
          <AttributeEditor
            key={key}
            item={mode === 'edit' ? loaded!.item : null}
            platform={false}
            api={call}
            protect={protect}
            back={() => request(back)}
            saved={() => {
              setNotice('Característica salva.');
              complete(back);
            }}
          />
        ))}
    </Layout>
  );
}
