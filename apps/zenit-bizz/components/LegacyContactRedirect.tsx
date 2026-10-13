import { useEffect } from 'react';
import { useRouter } from 'next/router';
import { contactFilters, CONTACTS_PATH } from '@/lib/contact-filters';

export function LegacyContactRedirect({
  role,
  creating,
  editing
}: {
  role: 'customer' | 'supplier';
  creating?: boolean;
  editing?: boolean;
}) {
  const router = useRouter();
  useEffect(() => {
    if (!router.isReady) return;
    if (editing && typeof router.query.id !== 'string') return;
    const suffix = creating
      ? '/novo'
      : editing
        ? `/${encodeURIComponent(String(router.query.id))}`
        : '';
    void router.replace({
      pathname: `${CONTACTS_PATH}${suffix}`,
      query: { ...contactFilters(router.query), role }
    });
  }, [router.isReady, router.asPath, role, creating, editing]);
  return (
    <p className="loading-screen" role="status">
      Abrindo cadastro…
    </p>
  );
}
