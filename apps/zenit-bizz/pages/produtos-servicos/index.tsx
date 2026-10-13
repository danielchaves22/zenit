import { CatalogItems } from '@/components/CatalogItems';
import { Layout } from '@/components/Layout';
export default function Catalog() {
  return (
    <Layout breadcrumbs={[{ label: 'Cadastros' }, { label: 'Produtos e serviços' }]}>
      <CatalogItems />
    </Layout>
  );
}
