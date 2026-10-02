# Zenit

Monorepositório do backend compartilhado, do Zenit Cash e dos sites institucionais. Cash cuida das finanças; Day, Clock e Hub têm repositórios próprios e responsabilidades independentes.

## Onde começar

- [Guias públicos](https://zenitapp.net/docs/): uso de Cash, Day, Clock e Hub.
- [Índice técnico](docs/README.md): arquitetura, operação, integrações e decisões.
- [Cash](apps/zenit-cash/README.md): frontend financeiro e comandos locais.
- [Site institucional e portal](docs/operations/site/zenitapp-public-site-setup-guide.md): geração e publicação.
- [Testes do backend](docs/operations/testing/backend-local-integration-testing-guide.md) e [testes do frontend Cash](docs/operations/testing/zenit-cash-frontend-testing-guide.md).

## Estrutura

| Diretório             | Responsabilidade                                                       |
| --------------------- | ---------------------------------------------------------------------- |
| apps/zenit-cash       | Frontend Next.js com Pages Router                                      |
| backend               | API Node/Express, autenticação, regras financeiras e Prisma/PostgreSQL |
| packages              | Contratos e código compartilhados                                      |
| sites/zenitapp-public | Site institucional estático; documentação gerada em docs/              |
| docs                  | Fonte canônica da documentação deste repositório                       |
| scripts               | Build, verificação e ferramentas de manutenção                         |

O Hub atende o WhatsApp e consulta os serviços autorizados. O Cash continua resolvendo permissões e executando suas regras financeiras. Veja a [ponte Cash–Hub](docs/architecture/assistant/zenit-hub-extraction.md).

## Desenvolvimento local

Use Node.js 22 e npm 10 ou superior. Na raiz:

```powershell
npm ci
npm run build:assistant-contracts
Copy-Item backend/.env.example backend/.env
Copy-Item apps/zenit-cash/.env.local.example apps/zenit-cash/.env.local
```

Preencha as configurações locais a partir dos exemplos. O backend usa uma base PostgreSQL própria para desenvolvimento. Não use o banco de produção em migrações de desenvolvimento ou testes.

```powershell
npm --workspace backend run prisma:generate
npm --workspace backend run prisma:deploy
npm --workspace backend run dev
```

Em outro terminal:

```powershell
npm --workspace apps/zenit-cash run dev
```

O frontend usa http://localhost:3001 e o exemplo de API aponta para http://localhost:3000/api. Variáveis com prefixo NEXT*PUBLIC* são públicas no navegador; segredos ficam somente no backend. Consulte os arquivos .env.example para a lista de configurações, sem copiar credenciais para a documentação.

## Validação

```powershell
npm run verify:static
npm run test:docs
npm run build:docs:public
npm run build:docs:internal
```

O fluxo completo npm run verify inclui testes de integração e build do Cash. Ele exige a base de teste configurada conforme o roteiro técnico. Testes locais com serviços simulados não comprovam OAuth, WhatsApp, dispositivos físicos ou entrega de notificações em produção.

## Repositórios relacionados

- [Zenit Hub](https://github.com/danielchaves22/zenit-hub): canal WhatsApp, conexões, orquestração e entrega de notificações.
- [Zenit Day](https://github.com/danielchaves22/zenit-day): assuntos, tarefas, lembretes e sincronização.
- Zenit Clock: aplicativo nativo integrado ao Clockify; [guia de uso](docs/help/zenit-clock/getting-started-guide.md).

Os READMEs são pontos de entrada. Contratos e procedimentos duráveis ficam nos docs/ do repositório responsável. Registros antigos de versão e validação conservam sua data e não representam uma nova certificação do ambiente atual.
