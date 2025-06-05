# Controle de Acesso a Contas Financeiras

## 🎯 Visão Geral

Sistema de controle granular que permite definir quais contas financeiras cada usuário pode acessar, seguindo as melhores práticas de sistemas enterprise.

## 📊 Hierarquia de Permissões

- **ADMIN**: Acesso total a todas as contas de todas as empresas
- **SUPERUSER**: Acesso total a todas as contas da empresa + gerencia permissões dos USERs
- **USER**: Acesso apenas às contas especificamente autorizadas

## 🔧 Fluxos de Uso

### 1. Criação de Usuário com Permissões

```json
POST /api/users
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

**Opções de permissão:**
- `grantAllAccess: true` - Acesso a todas as contas
- `specificAccountIds: [1,2,3]` - Acesso apenas às contas especificadas
- Omitir `accountPermissions` - Nenhum acesso inicial

### 2. Gerenciamento de Acessos (SUPERUSER)

#### Visualizar Acessos de um Usuário
```http
GET /api/users/123/account-access
```

Retorna:
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
    }
  ]
}
```

#### Conceder Acesso Específico
```http
POST /api/users/123/account-access/grant
{
  "accountIds": [1, 2, 3]
}
```

#### Conceder Acesso Total
```http
POST /api/users/123/account-access/grant-all
```

#### Atualização em Lote (substitui todos os acessos)
```http
POST /api/users/123/account-access/bulk-update
{
  "accountIds": [1, 3, 5, 7]
}
```

#### Revogar Acessos
```http
DELETE /api/users/123/account-access/revoke
{
  "accountIds": [1, 2]
}
```

```http
DELETE /api/users/123/account-access/revoke-all
```

## 🛡️ Impacto nas Operações

### Para USERs com Acesso Limitado:

1. **Listagem de Contas**: Vê apenas contas autorizadas
2. **Transações**: Só pode criar/ver transações das contas acessíveis
3. **Relatórios**: Gerados apenas com dados das contas permitidas
4. **Dashboard**: Resumo considerando apenas contas autorizadas

### Transações Cross-Conta:
- Se transferência envolve Conta A (acessível) e Conta B (não acessível):
  - USER vê a transação mas Conta B aparece como "[Conta Restrita]"

## 🎨 Interface (Recomendações)

### 1. Form de Criação de Usuário
```
┌─ Dados Básicos ──────────────────┐
│ Nome: [João Silva            ]   │
│ Email: [joao@empresa.com     ]   │
│ Senha: [********             ]   │
│ Role: [USER ▼]                   │
└──────────────────────────────────┘

┌─ Permissões de Conta (Opcional) ─┐
│ ☐ Acesso a todas as contas       │
│                                  │
│ OU selecione contas específicas: │
│ ☐ Conta Principal (Corrente)     │
│ ☐ Poupança                       │
│ ☐ Cartão de Crédito             │
│ ☐ Investimentos                  │
└──────────────────────────────────┘
```

### 2. Listagem de Usuários
```
┌─ Usuários da Empresa ────────────────────────────┐
│ João Silva    USER    3/10 contas [Gerenciar]   │
│ Maria Santos  USER    Todas      [Gerenciar]    │
│ Pedro Admin   SUPER   Todas      -              │
└──────────────────────────────────────────────────┘
```

### 3. Modal de Gerenciamento
```
┌─ Gerenciar Acessos: João Silva ──────────────────┐
│                                                  │
│ ☐ Dar acesso a todas as contas                   │
│                                                  │
│ OU selecione contas específicas:                 │
│ ☑ Conta Principal    (concedido em 15/01)       │
│ ☐ Poupança                                       │
│ ☑ Cartão de Crédito (concedido em 15/01)       │
│ ☐ Investimentos                                  │
│                                                  │
│              [Cancelar] [Salvar Alterações]      │
└──────────────────────────────────────────────────┘
```

## 🚀 Benefícios Implementados

1. **Segurança Enterprise**: Controle granular como SAP/Oracle
2. **Flexibilidade**: Permissões durante criação OU posterior
3. **Auditoria**: Log completo de quem concedeu cada permissão
4. **Performance**: Filtros otimizados no banco de dados
5. **UX Intuitiva**: Fluxos familiares para gestores

## 🔍 Monitoramento

Logs importantes gerados:
- Criação de usuários com permissões
- Concessão/revogação de acessos
- Tentativas de acesso não autorizado
- Operações financeiras por usuário

## ⚠️ Considerações Importantes

1. **ADMIN/SUPERUSER sempre têm acesso total** - não precisam de permissões explícitas
2. **USERs sem permissões** veem interfaces vazias com orientação para contatar SUPERUSER
3. **Cache invalidado** automaticamente quando permissões mudam
4. **Transações existentes** não são afetadas - apenas visualização futura

Esta implementação está alinhada com padrões enterprise e pronta para crescimento da plataforma.