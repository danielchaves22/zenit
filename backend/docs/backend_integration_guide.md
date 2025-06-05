# Integração Backend - Controle de Acesso a Contas Financeiras

## 🎯 Resumo Funcional

O sistema agora implementa controle granular de acesso às contas financeiras para usuários com role `USER`. ADMIN e SUPERUSER mantêm acesso total, enquanto USERs só acessam contas explicitamente autorizadas.

## 🔄 Fluxo de Dados e Comportamentos

### Hierarquia de Permissões (Não Mudou)
- **ADMIN**: Acesso total a tudo, todas as empresas
- **SUPERUSER**: Acesso total à empresa + gerencia permissões dos USERs  
- **USER**: Acesso limitado às contas autorizadas

### Novos Comportamentos por Endpoint

#### 1. **GET /api/financial/accounts**
**Antes**: Retornava todas as contas da empresa
**Agora**: 
- ADMIN/SUPERUSER: Retorna todas (comportamento inalterado)
- USER: Retorna apenas contas com permissão explícita
- USER sem permissões: Retorna array vazio `[]`

#### 2. **GET /api/financial/transactions**
**Antes**: Retornava todas as transações da empresa
**Agora**:
- ADMIN/SUPERUSER: Retorna todas (comportamento inalterado)
- USER: Retorna apenas transações que envolvem contas acessíveis
- USER sem permissões: Retorna array vazio `[]`

#### 3. **GET /api/financial/summary**
**Antes**: Calculava com todas as contas
**Agora**:
- ADMIN/SUPERUSER: Calcula com todas as contas (comportamento inalterado)
- USER: Calcula apenas com contas acessíveis
- USER sem permissões: Retorna totais zerados

#### 4. **POST /api/financial/transactions**
**Comportamento Novo**: Verifica se usuário tem acesso às contas `fromAccountId` e `toAccountId`
- Se não tem acesso: HTTP 403 com mensagem específica
- Se tem acesso: Procede normalmente

#### 5. **Operações em Contas Específicas**
Endpoints como `GET/PUT/DELETE /api/financial/accounts/:id` agora verificam acesso:
- ADMIN/SUPERUSER: Acesso normal
- USER: Deve ter permissão à conta específica, senão HTTP 403

## 📡 Novos Endpoints para Gerenciamento

### Visualizar Permissões de um Usuário
```http
GET /api/users/{userId}/account-access
Authorization: Bearer {token} // ADMIN ou SUPERUSER
```

**Response**:
```json
{
  "totalAccounts": 10,
  "accessibleAccounts": 3,
  "hasFullAccess": false,
  "accounts": [
    {
      "id": 1,
      "name": "Conta Principal",
      "type": "CHECKING", 
      "hasAccess": true,
      "grantedAt": "2024-01-15T10:00:00Z",
      "grantedBy": { "id": 5, "name": "Maria Admin" }
    },
    {
      "id": 2,
      "name": "Poupança",
      "type": "SAVINGS",
      "hasAccess": false
    }
  ]
}
```

### Gerenciar Permissões
```http
POST /api/users/{userId}/account-access/grant
{ "accountIds": [1, 2, 3] }

POST /api/users/{userId}/account-access/grant-all

DELETE /api/users/{userId}/account-access/revoke  
{ "accountIds": [1, 2] }

DELETE /api/users/{userId}/account-access/revoke-all

POST /api/users/{userId}/account-access/bulk-update
{ "accountIds": [1, 3, 5] } // Substitui todos os acessos existentes
```

## 🆕 Criação de Usuário com Permissões

### Payload Estendido
```http
POST /api/users
```

O payload do `POST /api/users` agora aceita campo opcional `accountPermissions`:

```json
{
  "name": "João Silva",
  "email": "joao@empresa.com", 
  "password": "senha123",
  "companyId": 1,
  "newRole": "USER",
  "accountPermissions": {
    "grantAllAccess": false,
    "specificAccountIds": [1, 3, 5]
  }
}
```

**Regras**:
- Se `accountPermissions` omitido: Usuário criado sem permissões
- Se `grantAllAccess: true`: Ignora `specificAccountIds`
- Se `grantAllAccess: false`: Usa `specificAccountIds` (pode ser vazio)
- Campo só funciona para role `USER` (ignorado para ADMIN/SUPERUSER)

## 🚫 Tratamento de Casos Limitantes

### USER sem Permissões
- **Dashboard**: Totais zerados, lista de contas vazia
- **Transações**: Lista vazia
- **Formulários**: Dropdowns de conta vazios

### Transações Cross-Conta (Futuro)
Quando USER vê transação que envolve conta não acessível:
- Conta acessível: Mostra normalmente
- Conta não acessível: Exibir como `"[Conta Restrita]"`

### Mensagens de Erro Padronizadas
- Acesso negado à conta: `"Acesso negado a esta conta financeira"`
- Acesso negado à transação: `"Acesso negado à conta de origem/destino"`
- Usuário sem permissões: Interface vazia (não erro)

## 🔒 Verificações de Segurança

### O que o Backend Garante
1. USER nunca vê dados de contas não autorizadas
2. USER nunca consegue operar em contas não autorizadas  
3. Apenas ADMIN/SUPERUSER podem gerenciar permissões
4. Tentativas não autorizadas são logadas

### O que o Frontend Deve Considerar
1. Dropdowns de contas podem vir vazios para USERs
2. Listas de transações podem vir vazias 
3. Dashboards podem mostrar zeros (não é erro)
4. Formulários podem não ter opções disponíveis

## 📊 Impactos em Relatórios

Todos os relatórios financeiros agora respeitam as permissões:
- **Relatório de Movimentação**: Apenas contas acessíveis
- **Sumário Financeiro**: Calculado só com contas permitidas
- **Exportações**: Dados filtrados por permissão

## 🔄 Migração e Retrocompatibilidade

### Usuários Existentes
- ADMIN/SUPERUSER: Zero impacto, funcionam igual
- USER existentes: **Ficam sem acesso até SUPERUSER conceder**

### Dados Existentes  
- Transações históricas: Permanecem inalteradas
- Contas existentes: Permanecem inalteradas
- Apenas visualização futura é filtrada

## 🎛️ Considerações de UX

### Estados Esperados
1. **Loading**: Durante verificação de permissões
2. **Empty State**: USER sem acesso (não é erro)
3. **Error State**: Problemas de rede/servidor
4. **Partial Access**: USER vê algumas contas, não todas

### Indicadores Visuais Sugeridos
- Badge no usuário indicando "Acesso Limitado"
- Contador "X de Y contas acessíveis" 
- Ícone de cadeado em elementos restritos

### Fluxos de Onboarding
1. SUPERUSER cria USER → Deve ser direcionado para dar permissões
2. USER loga primeira vez → Pode ver interface vazia (normal)
3. USER perde permissões → Interface fica vazia gradualmente

## ⚡ Performance e Cache

- Consultas filtradas por permissão usam índices otimizados
- Cache de dashboard invalidado quando permissões mudam
- Operações em lote otimizadas para múltiplas concessões

## 🔍 Debug e Monitoramento

### Logs Relevantes
- `"Account access granted"` - Permissão concedida
- `"Unauthorized account access attempt"` - Tentativa negada
- `"Financial transaction completed"` - Operação financeira por usuário

### Headers de Debug (Development)
Em desenvolvimento, respostas incluem header indicando filtros aplicados:
```
X-Access-Filter: user-limited
X-Accessible-Accounts: 3
```

Esta funcionalidade está production-ready e segue padrões enterprise de controle de acesso granular.