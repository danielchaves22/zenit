import { Layout } from '@/components/Layout';
import { Purchases } from '@/components/Purchases';
export default function PurchasesPage() {
  return (
    <Layout breadcrumbs={[{ label: 'Operação' }, { label: 'Compras' }]}>
      <Purchases />
    </Layout>
  );
}
