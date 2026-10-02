# zenitapp.net — site institucional

Site estático da família Zenit, desenvolvida pela Equinox Tecnologia. A apresentação é dividida entre uso pessoal e negócios, com páginas próprias para cada aplicativo.

## Rotas

- `/` apresentação da marca e entrada para as duas áreas
- `/para-voce` finanças pessoais, assuntos, horas e consultas por conversa
- `/para-negocios` finanças, solicitações de cálculos e horas por projeto
- `/cash`, `/day`, `/clock`, `/hub`, `/zenitcalc` apresentação de cada aplicativo
- `/sobre` propósito dos produtos e identificação da Equinox Tecnologia
- `/contato` acesso, disponibilidade, suporte e privacidade
- `/docs` documentação pública gerada a partir dos Markdown do monorepo
- `/orcamento-mobile` apresentação do projeto anterior de orçamento pessoal
- `/privacy` política de privacidade, incluindo o uso de dados Google pelo Hub
- `/terms` termos de serviço
- `/login` redireciona para `https://calc.zenitapp.net/login`

## Estrutura

- `index.html` e `<rota>/index.html`: páginas em HTML, sem etapa de compilação própria.
- `styles.css`: identidade visual, componentes e adaptação a telas pequenas.
- `site.js`: navegação móvel, com suporte a teclado; o conteúdo continua acessível sem JavaScript.
- `assets/images/`: marca e recursos visuais existentes.
- `docs/`: saída gerada e ignorada pelo Git; não editar diretamente.

Cabeçalho e rodapé são compartilhados visualmente, mas estão presentes em cada HTML. Ao alterar a navegação, atualizar todas as páginas institucionais. O portal de documentação mantém seu gerador próprio.

## Direção do conteúdo

- A página inicial apresenta a marca; cada área explica necessidades e usos do respectivo público.
- Descrever recursos existentes, sem prometer disponibilidade geral, planos ou funcionalidades não confirmadas.
- Cash, Day, Clock e Hub compõem a apresentação pessoal. Cash, Calc e Clock têm usos apresentados na área de negócios.
- O Clock usa o Clockify; não é apresentado como um conector do Hub.
- O Calc tem disponibilidade sob consulta. Orçamento Mobile é um projeto anterior de orçamento pessoal, não uma solução de orçamentos comerciais.
- Exemplos visuais são identificados como ilustrações e não contêm dados reais de usuários.
- Preservar os endereços `/hub`, `/privacy` e `/terms`, usados nos fluxos de autorização, e as informações de uso de dados Google.
- O contato usa links de e-mail, sem coleta por formulário ou inclusão de rastreadores.

## Validação local

1. Executar `npm run test:docs` e `npm run build:docs:public` na raiz do monorepo.
2. Servir esta pasta por HTTP para validar caminhos absolutos e subdiretórios.
3. Verificar navegação, âncoras, menu móvel, teclado, perguntas expansíveis e ausência de rolagem horizontal em 320 px e desktop.
4. Conferir links, metadados, conteúdo de privacidade e `git diff --check` antes de publicar.

## Deploy no Render (Static Site)

- Usar o Static Site institucional existente, apontado para este repositório.
- Definir `Publish Directory` como `sites/zenitapp-public`.
- Definir `Build Command` como `npm ci && npm run build:docs:public`.
- Configurar dominio custom `zenitapp.net` (e opcionalmente `www.zenitapp.net`).

## Observações

O app autenticado do Zenit Calc continua em `calc.zenitapp.net` e o Cash em `zenit-cash.onrender.com`, como serviços separados.
O portal `/docs` é gerado a partir do acervo em `docs/`, que continua sendo a fonte de verdade. O filtro de visibilidade pública é aplicado pelo gerador.

O portal organiza guias por aplicativo, oferece busca local e gera âncoras para os títulos. CSS e JavaScript próprios ficam em `scripts/docs-site/`. As regras de metadados, links, assets e separação do build interno estão no [guia de publicação](../../docs/operations/site/zenitapp-public-site-setup-guide.md).
