import Link from 'next/link';
import { useRouter } from 'next/router';
import { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { useNavigation } from '@/contexts/NavigationContext';
import { api } from '@/lib/api';
import { Contact } from '@/lib/types';
import { ContactForm } from './ContactForm';
import { Layout } from './Layout';
import { contactFilters, CONTACTS_PATH } from '@/lib/contact-filters';

function Editor({ editing }: { editing: boolean }) {
  const router = useRouter();
  const { company } = useAuth();
  const { complete, setNotice } = useNavigation();
  const [loaded, setLoaded] = useState<{ key: string; contact: Contact } | null>(null);
  const [error, setError] = useState('');
  const [revision, setRevision] = useState(0);
  const id = typeof router.query.id === 'string' ? router.query.id : '';
  const key = `${company?.id}:${id}`;
  const base = CONTACTS_PATH;
  const listQuery = contactFilters(router.query);
  const back = () => {
    void router.push({ pathname: base, query: listQuery });
  };
  useEffect(() => {
    if (!editing || !company || !router.isReady || !id) return;
    const controller = new AbortController();
    setError('');
    setLoaded(null);
    void api<Contact>(`/bizz/contacts/${encodeURIComponent(id)}`, {
      companyId: company.id,
      signal: controller.signal
    })
      .then((contact) => {
        if (!controller.signal.aborted) setLoaded({ key, contact });
      })
      .catch((e) => {
        if (!controller.signal.aborted)
          setError(e instanceof Error ? e.message : 'Não foi possível carregar o cadastro.');
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
        <Link className="button quiet" href={{ pathname: base, query: listQuery }}>
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
    <ContactForm
      key={key}
      contact={editing ? loaded!.contact : null}
      role={listQuery.role}
      personType={listQuery.personType === 'BUSINESS' ? 'BUSINESS' : 'PERSON'}
      companyId={company.id}
      onClose={back}
      onSaved={(contact) => {
        setNotice(`${contact.name}: cadastro salvo.`);
        complete(back);
      }}
    />
  );
}
export function ContactPage(props: { editing?: boolean }) {
  return (
    <Layout>
      <Editor editing={Boolean(props.editing)} />
    </Layout>
  );
}
