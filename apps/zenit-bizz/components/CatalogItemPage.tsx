import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigation } from '@/contexts/NavigationContext';
import { api } from '@/lib/api';
import { CatalogItem, catalogFilters, CATALOG_PATH } from '@/lib/catalog';
import { CatalogItemForm } from './CatalogItemForm';
import { Layout } from './Layout';

function Editor({ editing }: { editing: boolean }) {
  const router = useRouter();
  const { company } = useAuth();
  const { complete, setNotice } = useNavigation();
  const [loaded, setLoaded] = useState<{ key: string; item: CatalogItem } | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const key = `${company?.id}:${id}`;
  const listQuery = catalogFilters(router.query);
  const back = () => {
    void router.push({ pathname: CATALOG_PATH, query: listQuery });
  };
  useEffect(() => {
    if (!editing || !company || !router.isReady || !id) return;
    const controller = new AbortController();
    setError('');
    setLoaded(null);
    void api<CatalogItem>(`/bizz/catalog/${encodeURIComponent(id)}`, {
      companyId: company.id,
      signal: controller.signal
    })
      .then((item) => {
        if (!controller.signal.aborted) setLoaded({ key, item });
      })
      .catch((cause) => {
        if (!controller.signal.aborted)
          setError(
            cause instanceof Error ? cause.message : 'Não foi possível carregar o cadastro.'
          );
      });
    return () => controller.abort();
  }, [company?.id, id, editing, router.isReady, revision]);
  if (error)
    return (
      <div className="list-state">
        <p role="alert" className="form-error">
          {error}
        </p>
        <button className="button" onClick={() => setRevision((value) => value + 1)}>
          Tentar novamente
        </button>
        <Link className="button quiet" href={{ pathname: CATALOG_PATH, query: listQuery }}>
          Voltar
        </Link>
      </div>
    );
  if (!company || !router.isReady || (editing && loaded?.key !== key))
    return (
      <div className="list-state" role="status">
        Carregando cadastro…
      </div>
    );
  return (
    <CatalogItemForm
      key={key}
      item={editing ? loaded!.item : null}
      kind={listQuery.kind === 'SERVICE' ? 'SERVICE' : 'PRODUCT'}
      usage={listQuery.usage}
      companyId={company.id}
      onClose={back}
      onSaved={(item) => {
        setNotice(`${item.name}: cadastro salvo.`);
        complete(back);
      }}
    />
  );
}
export function CatalogItemPage({ editing = false }: { editing?: boolean }) {
  const router = useRouter();
  return (
    <Layout
      breadcrumbs={[
        { label: 'Cadastros' },
        {
          label: 'Produtos e serviços',
          href: { pathname: CATALOG_PATH, query: catalogFilters(router.query) }
        },
        { label: editing ? 'Editar cadastro' : 'Novo cadastro' }
      ]}
    >
      <Editor editing={editing} />
    </Layout>
  );
}
