# Instruções Frontend - Saldo Negativo em Contas

## 🎯 Resumo da Funcionalidade

Adicionar campo `allowNegativeBalance` (boolean) às contas financeiras que permite/impede saldo negativo após transações.

## 📡 Mudanças na API

### **Endpoints Existentes Atualizados:**

#### 1. **GET /api/financial/accounts**
**Response atualizado:**
```json
[
  {
    "id": 1,
    "name": "Conta Principal",
    "type": "CHECKING",
    "balance": "1500.00",
    "allowNegativeBalance": false,  // ✅ NOVO CAMPO
    "isActive": true,
    // ... outros campos
  }
]
```

#### 2. **POST /api/financial/accounts**
**Payload atualizado:**
```json
{
  "name": "Nova Conta",
  "type": "CHECKING",
  "allowNegativeBalance": false,  // ✅ NOVO CAMPO OPCIONAL
  "initialBalance": 0
}
```

#### 3. **PUT /api/financial/accounts/:id**
**Payload atualizado:**
```json
{
  "name": "Conta Atualizada",
  "allowNegativeBalance": true,  // ✅ NOVO CAMPO OPCIONAL
  "isActive": true
}
```

## 🎨 Implementação na Interface

### **1. Form de Criação de Conta**
Adicionar após os campos existentes:

```jsx
<FormField>
  <Label>Permitir Saldo Negativo</Label>
  <Checkbox
    checked={formData.allowNegativeBalance || false}
    onChange={(checked) => setFormData({
      ...formData, 
      allowNegativeBalance: checked
    })}
    disabled={formData.type === 'CREDIT_CARD'} // ✅ SEMPRE TRUE para cartão
  />
  <HelpText>
    {formData.type === 'CREDIT_CARD' 
      ? "Cartões de crédito sempre permitem saldo negativo"
      : "Permite que a conta fique com saldo negativo (ex: cheque especial)"
    }
  </HelpText>
</FormField>
```

### **2. Form de Edição de Conta** 
Mesmo campo do form de criação.

### **3. Listagem de Contas**
Adicionar indicador visual:

```jsx
<TableCell>
  {account.allowNegativeBalance && (
    <Badge variant="outline" className="text-blue-600">
      <MinusCircle className="w-3 h-3 mr-1" />
      Permite Negativo
    </Badge>
  )}
</TableCell>
```

### **4. Card/Resumo de Conta**
```jsx
<div className="flex items-center gap-2">
  <span className="font-medium">{account.name}</span>
  {account.allowNegativeBalance && (
    <Tooltip content="Permite saldo negativo">
      <MinusCircle className="w-4 h-4 text-blue-500" />
    </Tooltip>
  )}
</div>
```

## 🔄 Regras de UX

### **1. Comportamento por Tipo de Conta**
```typescript
// No form, quando tipo muda:
const handleTypeChange = (type) => {
  setFormData({
    ...formData,
    type,
    allowNegativeBalance: type === 'CREDIT_CARD' ? true : formData.allowNegativeBalance
  });
};
```

### **2. Validação Frontend**
```typescript
const validateForm = () => {
  // Cartão de crédito deve sempre permitir negativo
  if (formData.type === 'CREDIT_CARD' && !formData.allowNegativeBalance) {
    return "Cartões de crédito devem permitir saldo negativo";
  }
  return null;
};
```

### **3. Estados Visuais**
```jsx
// Mostrar saldo negativo de forma diferente
const formatBalance = (balance, allowNegativeBalance) => {
  const isNegative = parseFloat(balance) < 0;
  const className = isNegative 
    ? (allowNegativeBalance ? 'text-orange-600' : 'text-red-600')  
    : 'text-green-600';
    
  return (
    <span className={className}>
      {formatCurrency(balance)}
      {isNegative && allowNegativeBalance && (
        <span className="text-xs ml-1">(autorizado)</span>
      )}
    </span>
  );
};
```

## ⚠️ Tratamento de Erros

### **Erros Específicos da API:**
```typescript
// Possíveis erros que podem vir do backend:
const errorMessages = {
  "Cartões de crédito devem permitir saldo negativo": 
    "Cartões de crédito não podem ter essa opção desabilitada",
  
  "Não é possível desabilitar saldo negativo. Saldo atual": 
    "Esta conta tem saldo negativo. Regularize o saldo antes de desabilitar",
    
  "Insufficient balance":
    "Saldo insuficiente. Esta conta não permite saldo negativo"
};
```

## 🔧 Implementação Técnica

### **1. Adicionar ao Schema/Type do Frontend**
```typescript
interface FinancialAccount {
  id: number;
  name: string;
  type: 'CHECKING' | 'SAVINGS' | 'CREDIT_CARD' | 'INVESTMENT' | 'CASH';
  balance: string;
  allowNegativeBalance: boolean; // ✅ ADICIONAR
  isActive: boolean;
  // ... outros campos
}
```

### **2. Valores Padrão**
```typescript
const defaultAccountForm = {
  name: '',
  type: 'CHECKING',
  allowNegativeBalance: false, // ✅ PADRÃO FALSE
  initialBalance: 0,
};
```

### **3. Atualizar Calls de API**
```typescript
// Incluir o novo campo nos payloads de create/update
const createAccount = async (accountData) => {
  return api.post('/financial/accounts', {
    ...accountData,
    allowNegativeBalance: accountData.allowNegativeBalance || false
  });
};
```

## 💡 Melhorias Opcionais de UX

### **1. Ícones Sugestivos**
- ✅ `CheckCircle` - Permite negativo
- ❌ `XCircle` - Não permite negativo  
- ⚠️ `AlertTriangle` - Saldo negativo não autorizado

### **2. Tooltip Explicativo**
```jsx
<Tooltip content="Quando habilitado, permite que a conta tenha saldo negativo após transações (como cheque especial)">
  <HelpCircle className="w-4 h-4 text-gray-400" />
</Tooltip>
```

### **3. Alerta Visual**
```jsx
{account.balance < 0 && !account.allowNegativeBalance && (
  <Alert variant="destructive">
    <AlertTriangle className="h-4 w-4" />
    <AlertTitle>Atenção</AlertTitle>
    <AlertDescription>
      Esta conta está com saldo negativo mas não permite essa situação.
    </AlertDescription>
  </Alert>
)}
```

## 🧪 Casos de Teste

### **Cenários para Testar:**
1. ✅ Criar conta corrente sem permitir negativo
2. ✅ Criar cartão de crédito (deve automaticamente marcar campo)  
3. ✅ Editar conta e habilitar saldo negativo
4. ❌ Tentar desabilitar saldo negativo em cartão (deve dar erro)
5. ❌ Tentar desabilitar saldo negativo em conta que já está negativa
6. ✅ Transação que resulta em saldo negativo (deve passar se permitido)

### **Estados para Testar:**
- Conta com saldo positivo + permite negativo ✅
- Conta com saldo negativo + permite negativo ⚠️ (autorizado)
- Conta com saldo negativo + não permite negativo ❌ (problema)

## 🎯 Resumo dos Pontos de Modificação

1. **Type/Interface**: Adicionar `allowNegativeBalance: boolean`
2. **Forms**: Adicionar checkbox com regras por tipo de conta
3. **Listagens**: Indicador visual para contas que permitem negativo
4. **Validações**: Cartão sempre true, outros podem escolher
5. **Formatação**: Saldo negativo com indicação se é autorizado
6. **Error Handling**: Mensagens específicas para os novos cenários

**Implementação estimada: 2-4 horas dependendo da complexidade dos componentes existentes.**