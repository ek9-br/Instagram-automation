# brand_bible.md — Identidade de marca (estrutura padrão)

Estrutura de referência para a identidade de cada marca. Os agentes consultam
este arquivo para garantir aderência de tom, linguagem e visual. Os valores
abaixo são um **exemplo preenchido** (marca fictícia "Acme") que serve de molde —
substitua pelos dados reais de cada marca.

> Futuramente cada marca terá seu próprio `brand_bible` carregado pelo worker a
> partir do Supabase. O formato dos campos permanece o mesmo.

---

## Marca: Acme

### Missão
Ajudar pequenos negócios a venderem mais no digital sem depender de agências
caras, por meio de conteúdo simples e estratégico.

### Visão
Ser a referência em educação prática de marketing para microempreendedores
brasileiros até 2030.

### Valores
- **Clareza** acima de jargão.
- **Honestidade** — sem promessas mágicas.
- **Praticidade** — todo conteúdo gera ação.
- **Proximidade** — falamos como gente, não como manual.

### Tom de voz
- Direto, encorajador e didático.
- Confiante sem ser arrogante.
- Otimista, mas realista (sem "fórmulas mágicas").
- Usa exemplos concretos do dia a dia do pequeno negócio.

### Linguagem
- Tratamento: "você".
- Frases curtas. Voz ativa.
- Pode usar emojis com moderação (até 3 por peça) para escaneabilidade.
- Evitar anglicismos quando houver termo claro em português.

### Palavras obrigatórias (quando fizer sentido)
- "na prática"
- "passo a passo"
- "sem complicação"
- "comece hoje"

### Palavras proibidas
- "fórmula mágica", "dinheiro fácil", "ficar rico rápido"
- "garantido" / "garantia de resultado"
- Promessas numéricas não comprovadas ("dobre suas vendas em 7 dias")
- Palavrões e termos pejorativos

### Diretrizes visuais
- **Paleta primária:** azul-profundo `#1E3A8A`, off-white `#F8FAFC`.
- **Paleta de apoio:** verde-menta `#34D399` (destaques/CTA), grafite `#1F2937`.
- **Tipografia:** sans-serif geométrica para títulos; sans-serif neutra para
  corpo.
- **Estilo de imagem:** fotografia real e iluminada de pequenos
  empreendedores; ilustrações planas para conceitos abstratos.
- **Logo:** versão off-white sobre fundos escuros; versão azul sobre fundos
  claros.
- **O que evitar:** bancos de imagem genéricos de "executivos de gravata",
  gradientes berrantes, excesso de texto na arte.

---

## Como adicionar uma nova marca
Replicar a estrutura acima (Missão, Visão, Valores, Tom de voz, Linguagem,
Palavras obrigatórias, Palavras proibidas, Diretrizes visuais). O campo `brand`
do request deve corresponder ao nome da marca aqui definido.
