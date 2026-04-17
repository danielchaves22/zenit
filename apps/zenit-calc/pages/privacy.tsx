import Head from 'next/head';
import Link from 'next/link';
import Image from 'next/image';

export default function PrivacyPage() {
  return (
    <>
      <Head>
        <title>Politica de Privacidade | Zenit</title>
        <meta
          name="description"
          content="Politica de Privacidade da plataforma Zenit para uso da aplicacao e integracoes com Google APIs."
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
            <h1 className="text-2xl md:text-3xl font-semibold">Politica de Privacidade - Zenit</h1>
            <p className="mt-2 text-sm text-muted">Ultima atualizacao: 17 de abril de 2026</p>
          </header>

          <section className="space-y-6 text-sm md:text-base leading-relaxed">
            <div>
              <h2 className="text-lg font-semibold">1. Quem somos</h2>
              <p>
                Esta plataforma e operada pela Equinox Team para suporte a fluxos operacionais de calculos
                trabalhistas. Para assuntos de privacidade, contato: suporte@equinoxtecnologia.com.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">2. Dados tratados</h2>
              <p>Podemos tratar dados cadastrais e operacionais, incluindo:</p>
              <ul className="list-disc pl-6 space-y-1">
                <li>dados de conta e autenticacao (nome, email, perfil de acesso);</li>
                <li>dados de processos e registros gerados na plataforma;</li>
                <li>metadados de integracao com Gmail quando habilitado pela empresa contratante;</li>
                <li>informacoes extraidas automaticamente para classificacao operacional.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold">3. Finalidades</h2>
              <ul className="list-disc pl-6 space-y-1">
                <li>fornecer funcionalidades da plataforma;</li>
                <li>executar integracoes autorizadas (como Gmail);</li>
                <li>prevenir duplicidades e manter historico operacional;</li>
                <li>garantir seguranca, auditoria e cumprimento legal.</li>
              </ul>
            </div>

            <div>
              <h2 className="text-lg font-semibold">4. Compartilhamento</h2>
              <p>
                Os dados podem ser compartilhados apenas com provedores necessarios para operacao da
                plataforma (infraestrutura, autenticacao, APIs de terceiros e monitoramento), sempre dentro
                da finalidade contratada e limites legais. Nao comercializamos dados pessoais.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">5. Google APIs</h2>
              <p>
                O uso e a transferencia para qualquer outro aplicativo de informacoes recebidas das Google
                APIs seguirao a{' '}
                <a
                  href="https://developers.google.com/terms/api-services-user-data-policy"
                  target="_blank"
                  rel="noreferrer"
                  className="text-accent underline"
                >
                  Google API Services User Data Policy
                </a>
                , incluindo os requisitos de Limited Use.
              </p>
              <p className="mt-2">
                Em especial: "Zenit&apos;s use and transfer to any other app of information received from
                Google APIs will adhere to Google API Services User Data Policy, including the Limited Use
                requirements."
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">6. Retencao e seguranca</h2>
              <p>
                Mantemos os dados pelo prazo necessario para cumprir as finalidades descritas, obrigacoes
                legais e auditoria. Aplicamos controles tecnicos e organizacionais proporcionais ao risco,
                incluindo controle de acesso e protecao de credenciais.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">7. Direitos dos titulares</h2>
              <p>
                O titular pode solicitar acesso, correcao e demais direitos previstos na legislacao aplicavel.
                Solicitacoes podem ser enviadas para suporte@equinoxtecnologia.com.
              </p>
            </div>

            <div>
              <h2 className="text-lg font-semibold">8. Alteracoes desta politica</h2>
              <p>
                Esta politica pode ser atualizada periodicamente. A versao vigente sera sempre a publicada
                nesta pagina.
              </p>
            </div>
          </section>

          <footer className="mt-8 border-t border-soft pt-4 text-sm text-muted">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <span>Contato: suporte@equinoxtecnologia.com</span>
              <div className="flex gap-4">
                <Link href="/terms" className="text-accent underline">
                  Termos de Servico
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
