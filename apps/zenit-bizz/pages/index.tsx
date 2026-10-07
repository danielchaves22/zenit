import { useEffect } from 'react';
import { useRouter } from 'next/router';
export default function Home() {
  const router = useRouter();
  useEffect(() => {
    void router.replace('/clientes');
  }, [router]);
  return (
    <p role="status" className="loading-screen">
      Abrindo seus cadastros…
    </p>
  );
}
