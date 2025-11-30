# 🎨 Como Adicionar Novos Temas - Passo a Passo

## 📋 **Método Simples (Recomendado)**

### **1. Editar o ThemeContext.tsx**

```typescript
// apps/zenit/contexts/ThemeContext.tsx

// ✅ PASSO 1: Adicionar nova cor no type
export type ThemeColor = 'amber' | 'blue' | 'purple' | 'green' | 'red' | 'indigo' | 'pink' | 
  'NOVA_COR_AQUI'; // ⬅️ Adicione aqui

// ✅ PASSO 2: Adicionar configuração da cor
const themeConfig: Record<ThemeColor, Omit<ThemeInfo, 'key'>> = {
  // ... temas existentes ...
  
  // ⬅️ ADICIONE SEU NOVO TEMA AQUI
  NOVA_COR_AQUI: {
    label: 'Nome Bonito',
    category: 'vibrant', // ou 'professional', 'standard', 'seasonal'
    accessibility: 'high', // ou 'medium', 'low'
    colors: {
      primary: '#HEX_COR_PRINCIPAL',
      primaryHover: '#HEX_COR_HOVER', // mais escura
      primaryLight: '#HEX_COR_CLARA', // mais clara
      primaryDark: '#HEX_COR_ESCURA', // bem escura
      gradient: 'linear-gradient(135deg, #COR1 0%, #COR2 100%)',
      shadow: '0 10px 25px rgba(R, G, B, 0.3)'
    }
  }
};
```

### **2. Exemplo Prático - Tema "Coral"**

```typescript
// Adicionando um tema coral/salmão
export type ThemeColor = 'amber' | 'blue' | 'purple' | 'green' | 'red' | 'indigo' | 'pink' | 
  'coral'; // ✅ Nova cor

const themeConfig = {
  // ... outros temas ...
  
  coral: {
    label: 'Coral',
    category: 'vibrant',
    accessibility: 'high',
    colors: {
      primary: '#ff6b6b',        // Coral principal
      primaryHover: '#ff5252',   // Coral mais intenso
      primaryLight: '#ff8a80',   // Coral claro
      primaryDark: '#d32f2f',    // Coral escuro
      gradient: 'linear-gradient(135deg, #ff6b6b 0%, #d32f2f 100%)',
      shadow: '0 10px 25px rgba(255, 107, 107, 0.3)'
    }
  }
};
```

---

## 🛠️ **Ferramentas para Escolher Cores**

### **1. Geradores de Paleta Online**
- **Coolors.co** - https://coolors.co
- **Adobe Color** - https://color.adobe.com
- **Paletton** - https://paletton.com
- **Material Design Colors** - https://materialui.co/colors

### **2. Regra das Cores**
```typescript
// Baseado na cor principal, gere as variações:
const baseCor = '#ff6b6b'; // Sua cor principal

// Hover: 10-15% mais escura
const hover = darken(baseCor, 0.1);

// Light: 20-30% mais clara
const light = lighten(baseCor, 0.2);

// Dark: 30-40% mais escura
const dark = darken(baseCor, 0.3);
```

### **3. Testador de Contraste**
```javascript
// Cole no console do browser para testar
function testContrast(hexColor) {
  const rgb = hexToRgb(hexColor);
  const luminance = (0.299 * rgb.r + 0.587 * rgb.g + 0.114 * rgb.b) / 255;
  
  console.log(`Cor: ${hexColor}`);
  console.log(`Contraste com branco: ${luminance < 0.5 ? '✅ Bom' : '❌ Ruim'}`);
  console.log(`Acessibilidade: ${luminance < 0.3 ? 'Alta' : luminance < 0.5 ? 'Média' : 'Baixa'}`);
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : null;
}

// Exemplo de uso:
testContrast('#ff6b6b'); // Testa coral
```

---

## 🎯 **Exemplos de Temas Populares**

### **Tema Midnight (Azul Escuro)**
```typescript
midnight: {
  label: 'Meia-noite',
  category: 'professional',
  accessibility: 'high',
  colors: {
    primary: '#1e3a8a',
    primaryHover: '#1e40af',
    primaryLight: '#3b82f6',
    primaryDark: '#1e293b'
  }
}
```

### **Tema Sunset (Gradiente Laranja)**
```typescript
sunset: {
  label: 'Pôr do Sol',
  category: 'vibrant',
  accessibility: 'high',
  colors: {
    primary: '#f97316',
    primaryHover: '#ea580c',
    primaryLight: '#fb923c',
    primaryDark: '#c2410c',
    gradient: 'linear-gradient(135deg, #f97316 0%, #ea580c 50%, #dc2626 100%)'
  }
}
```

### **Tema Forest (Verde Floresta)**
```typescript
forest: {
  label: 'Floresta',
  category: 'professional',
  accessibility: 'high',
  colors: {
    primary: '#166534',
    primaryHover: '#15803d',
    primaryLight: '#22c55e',
    primaryDark: '#14532d'
  }
}
```

---

## 🎨 **Paletas Temáticas**

### **Cores da Natureza**
```typescript
// Oceano
ocean: { primary: '#0891b2', hover: '#0e7490', light: '#06b6d4', dark: '#164e63' }

// Montanha  
mountain: { primary: '#6b7280', hover: '#4b5563', light: '#9ca3af', dark: '#374151' }

// Deserto
desert: { primary: '#d69e2e', hover: '#b7791f', light: '#ecc94b', dark: '#9c4221' }
```

### **Cores de Marcas Famosas**
```typescript
// GitHub
github: { primary: '#24292e', hover: '#1b1f23', light: '#586069', dark: '#0d1117' }

// Netflix
netflix: { primary: '#e50914', hover: '#b20710', light: '#f40612', dark: '#831010' }

// Spotify
spotify: { primary: '#1db954', hover: '#1ed760', light: '#1db954', dark: '#169c46' }
```

---

## ⚡ **Dicas Avançadas**

### **1. Tema com Base em Imagem**
```typescript
// Use uma ferramenta como Colormind.io para extrair cores de imagens
// e criar paletas harmoniosas baseadas em fotos
```

### **2. Temas Sazonais**
```typescript
// Adicione temas que mudam automaticamente por data
function getSeasonalTheme() {
  const month = new Date().getMonth();
  
  if (month >= 2 && month <= 4) return 'spring'; // Primavera
  if (month >= 5 && month <= 7) return 'summer'; // Verão
  if (month >= 8 && month <= 10) return 'autumn'; // Outono
  return 'winter'; // Inverno
}
```

### **3. Tema Baseado no Horário**
```typescript
// Tema que muda conforme a hora do dia
function getTimeBasedTheme() {
  const hour = new Date().getHours();
  
  if (hour >= 6 && hour < 12) return 'morning';   // Manhã
  if (hour >= 12 && hour < 18) return 'afternoon'; // Tarde
  if (hour >= 18 && hour < 22) return 'evening';   // Noite
  return 'night'; // Madrugada
}
```

---

## ✅ **Checklist Final**

Antes de adicionar um novo tema, verifique:

- [ ] Cor principal tem bom contraste com texto branco
- [ ] Hover é visualmente diferente mas harmonioso  
- [ ] Acessibilidade é adequada (use ferramentas de teste)
- [ ] Funciona bem em elementos pequenos (ícones, badges)
- [ ] Não conflita com cores de sistema (success, danger, etc.)
- [ ] Testado em diferentes componentes da interface
- [ ] Nome e categoria fazem sentido
- [ ] Gradiente (se usado) não prejudica legibilidade

---

## 🚀 **Resultado**

Após adicionar um novo tema, ele aparecerá automaticamente:
- ✅ No seletor do header
- ✅ Na página de configurações  
- ✅ Organizado por categoria
- ✅ Com indicador de acessibilidade
- ✅ Salvo automaticamente quando selecionado

Pronto! Seu novo tema estará disponível para todos os usuários! 🎉