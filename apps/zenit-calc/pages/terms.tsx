import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';

export default function TermsPage() {
  return (
    <>
      <Head>
        <title>Termos de Servico | Zenit</title>
        <meta
          name="description"
          content="Termos de Servico da plataforma Zenit para uso por empresas e usuarios autorizados."
        />
      </Head>

      <main className="min-h-screen bg-background text-base-color px-4 py-8">
        <div className="mx-auto max-w-4xl rounded-xl border border-soft bg-surface p-6 md:p-10">
          <header className="mb-8 border-b border-soft pb-4">
            <div className="mb-4 flex justify-center">
              <Image
                src="/assets/images/logo.png"
                alt="Zenit"
                width={2000}
                height={1000}
                priority
                className="h-16 md:h-20 w-auto"
              />
            </div>
            <h1 className="text-2xl md:text-3xl font-semibold">Termos de Servico - Zenit</h1>
            <p className="mt-2 text-sm text-muted">Ultima atualizacao: 17 de abril de 2026</p>
          </header>

          <section className="space-y-6 text-sm md:text-base leading-relaxed">
            <div>
              <h2 className="text-lg font-semibold">1. Objeto</h2>
              <p>
                Estes Termos regulam o acesso e uso da plataforma Zenit, destinada a operacoes de gestao e
                apoio a calculos trabalhistas por empresas contratantes e usuarios autorizados.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">2. Conta e acesso</h2>
              <p>
                O acesso e restrito a usuarios cadastrados. Cada empresa e responsavel por seus usuarios,
                permissoes internas e guarda de credenciais.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">3. Integracoes de terceiros</h2>
              <p>
                A plataforma pode integrar servicos de terceiros, incluindo Google/Gmail e provedores de IA,
                quando habilitados pela empresa. A disponibilidade dessas integracoes depende das politicas e
                da disponibilidade dos respectivos fornecedores.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">4. Uso aceitavel</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>nao utilizar a plataforma para atividades ilicitas ou violacao de direitos;</li>
                <li>nao tentar acesso indevido a dados, contas ou sistemas;</li>
                <li>nao enviar conteudo malicioso, fraudulento ou sem autorizacao.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold">5. IA e automacoes</h2>
              <p>
                Funcionalidades automatizadas e de IA possuem carater de apoio operacional. A validacao
                final das informacoes e de responsabilidade da empresa usuaria.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">6. Propriedade intelectual</h2>
              <p>
                O software, marca e elementos da plataforma pertencem aos seus titulares. Os dados inseridos
                pelo cliente permanecem de titularidade do proprio cliente.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">7. Privacidade</h2>
              <p>
                O tratamento de dados pessoais segue a Politica de Privacidade, disponivel em{' '}
                <Link href="/privacy" className="text-accent underline">
                  /privacy
                </Link>
                .
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">8. Limitacao de responsabilidade</h2>
              <p>
                Na extensao permitida por lei, a Zenit nao responde por indisponibilidades de servicos de
                terceiros, mau uso da plataforma por usuarios da empresa contratante ou decisoes tomadas sem
                validacao humana adequada.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">9. Alteracoes e encerramento</h2>
              <p>
                Estes Termos podem ser atualizados periodicamente. O uso continuado da plataforma apos a
                publicacao de nova versao indica ciencia das alteracoes.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">10. Contato</h2>
              <p>Duvidas gerais e juridicas: suporte@equinoxtecnologia.com.</p>
            </div>
          </section>

          <footer className="mt-8 border-t border-soft pt-4 text-sm text-muted">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span>Contato: suporte@equinoxtecnologia.com</span>
              <div className="flex gap-4">
                <Link href="/privacy" className="text-accent underline">
                  Politica de Privacidade
                </Link>
                <Link href="/login" className="text-accent underline">
                  Acessar plataforma
                </Link>
              </div>
            </div>
          </footer>
        </div>
      </main>
    </>
  );
}
