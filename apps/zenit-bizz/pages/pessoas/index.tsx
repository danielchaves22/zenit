import { Contacts } from '@/components/Contacts';
import { Layout } from '@/components/Layout';
export default function People() {
  return (
    <Layout breadcrumbs={[{ label: 'Relacionamento' }, { label: 'Pessoas e empresas' }]}>
      <Contacts />
    </Layout>
  );
}
