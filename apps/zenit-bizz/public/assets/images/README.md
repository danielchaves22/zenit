# Marca Zenit Bizz

Os nomes dos arquivos indicam a superfície em que serão usados:

- `logo-light.png`: letras escuras, detalhe laranja, fundo transparente; para superfícies claras.
- `logo-dark.png`: letras claras, detalhe laranja, fundo grafite sólido; para superfícies escuras. Esta versão ainda não tem transparência e não deve ser apresentada como um recorte transparente.

O componente `Brand` recebe `surface="light"` (padrão) ou `surface="dark"`. A escolha acompanha o fundo real do componente, não a preferência de tema do sistema operacional. A interface atual usa a versão para superfícies claras.

## Origem e direção

Adaptação raster com a ferramenta integrada de edição de imagens, a partir de `apps/zenit-calc/public/assets/images/logo_principal.png`. Mantém o conceito visual da família: ZENIT desenhado, I atravessado pelo corte diagonal, nome da aplicação rotacionado 90 graus e ponto na cor de destaque. Não é um arquivo vetorial mestre.

Especificação usada na versão para fundo claro: preservar as formas e proporções do ZENIT de referência; trocar o detalhe azul pelo laranja de direção `#F97316`; substituir `calc.` por `bizz.` na vertical, com letras escuras e ponto laranja; fundo transparente, composição horizontal e sem efeitos decorativos.

Prompt final da versão para fundo escuro:

> Use case: precise-object-edit. Edit target: the supplied Zenit Bizz logo. Make the version for a dark website theme. Change only the charcoal lettering to flat off-white #F7F7F7, and fill the entire background with perfectly solid dark charcoal #181C22. Keep the wordmark silhouette, letter geometry, horizontal layout, tapered diagonal orange accent, and vertically rotated lowercase "bizz." exactly the same. This is a digital brand asset exported from vector design, NOT an illustration. Entire letter interiors are perfectly uniform flat colors. Every edge is smooth and crisp. The gaps between letters and inside letters are entirely clean solid #181C22 matching the outside background. Keep the orange accent in #F97316. No noise, speckles, texture, gradient, shadow, glow or outlines. Opaque background: do NOT remove the background, do not make transparency. Frame all artwork completely with a modest even margin, keeping the diagonal endpoints in frame. Wide ratio matching the reference.

As tentativas de extração transparente da versão de letras claras produziram resíduos nas bordas e foram descartadas. Os PNGs gerados podem apresentar pequenas variações de cor e geometria em relação à referência; um futuro mestre vetorial deve ser a fonte para exportações com identidade exata.
