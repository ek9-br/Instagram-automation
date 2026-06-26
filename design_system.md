# design_system.md — Sistema visual

Fonte única de verdade para layout, tipografia e composição das peças. Os
agentes (especialmente `image-prompt-writer`) devem respeitar estas regras e
nunca propor elementos fora das *safe areas* ou fora da hierarquia definida.

## 1. Grid e safe areas

- **Margem de segurança padrão:** 8% de cada lado em todos os formatos.
- **Conteúdo crítico** (texto, logo, CTA) nunca encosta nas bordas.
- **Stories / Reels (9:16):** reservar **topo 14%** e **base 18%** para a UI do
  Instagram (avatar, nome, barra de resposta). Nada importante nessas faixas.
- **Carrossel:** manter um eixo de leitura consistente entre slides (ex.: título
  sempre no terço superior) para dar continuidade visual.

## 2. Dimensões e presets

| Preset (format)            | Proporção | Tamanho (px)   | Safe area (topo/base) | Uso                       |
|----------------------------|-----------|----------------|-----------------------|---------------------------|
| `post_feed_3x4`            | 3:4       | 1080 × 1440    | 8% / 8%               | Post único de feed        |
| `carousel_3x4`             | 3:4       | 1080 × 1440    | 8% / 8%               | Carrossel (vários slides) |
| `stories_9x16`             | 9:16      | 1080 × 1920    | 14% / 18%             | Stories                   |
| `reels_cover_9x16`         | 9:16      | 1080 × 1920    | 14% / 18%             | Capa de Reels             |
| `ads_landscape_1_91_1`     | 1.91:1    | 1200 × 628     | 6% / 6%               | Anúncio paisagem          |

## 3. Hierarquia visual

Ordem de leitura (do mais forte ao mais fraco):
1. **Headline / gancho** — maior peso, terço superior.
2. **Apoio / subtítulo** — explica ou complementa.
3. **Corpo** — desenvolvimento, listas, passos.
4. **CTA** — destaque controlado, terço inferior.
5. **Marca / logo** — discreta, canto.

Regra dos 3 níveis: cada peça tem no máximo **3 níveis tipográficos visíveis**
para não poluir.

## 4. Tipografia

- **Família da marca:** **Proxima Nova** (corpo) e **Proxima Nova Condensed**
  (títulos/display). Sans-serif geométrica. Na ausência dela, usar uma sans-serif
  geométrica equivalente.
- **Display/headline:** peso bold/extrabold. Tamanho relativo: ~9–12% da altura
  da arte para feed/carrossel; ~7–9% para stories/reels.
- **Corpo:** peso regular/medium, alto contraste com o fundo.
- **Entrelinha:** 1.1–1.3 para títulos, 1.3–1.5 para corpo.
- **Máximo de caracteres por linha:** ~24 em títulos, ~38 em corpo.
- **Contraste mínimo:** WCAG AA (4.5:1) entre texto e fundo. Usar caixa/overlay
  quando o fundo for foto.

## 5. Logos

- Usar a versão de maior contraste com o fundo (clara em fundo escuro e
  vice-versa).
- Tamanho do logo: 6–10% da largura da arte.
- Posição padrão: canto inferior. Nunca sobre rostos ou pontos focais.
- Área de respiro ao redor do logo: no mínimo a altura do próprio símbolo.

## 6. CTA

- Sempre presente em peças de feed, stories e ads (no último slide, no caso de
  carrossel).
- Verbo no imperativo + benefício claro (ex.: "Salve este post", "Arraste para
  ver", "Toque no link").
- Destaque por botão, pílula ou cor de marca — sem competir com a headline.
- Um único CTA por peça.

## 7. Cor e composição (diretrizes)

- Paleta da marca (Coalize) — ver `brand_bible.md` para o uso:
  - Primária (teal/verde): `#14998D`
  - Accent/CTA (teal claro): `#1CD8C7`
  - Teal escuro (blocos/fundos): `#083A36` / `#003E3D`
  - Neutros: grafite `#1F2933`, slate `#3E4C59` / `#616E7C`
  - Fundos claros: off-white `#F5F7FA`, branco `#FFFFFF`
- **Estilo de imagem:** fotografia realista com **pessoas** (RH/DP, gestores,
  colaboradores) em ambiente de trabalho brasileiro; teal/verde como apoio sutil.
  **Não** usar ilustração/flat/ícone/dashboard fictício como elemento principal.
- Fundo deve garantir legibilidade do texto; preferir áreas chapadas (off-white ou
  teal escuro) atrás de blocos de texto.
- Evitar mais de 3 cores dominantes por peça.
- Imagens devem ter ponto focal claro e respeitar a *safe area*.

> Os `image_prompts` gerados devem mencionar explicitamente proporção e **renderizar
> o texto da peça DENTRO da imagem** (o texto faz parte da arte), na disposição do
> template e com a tipografia/cores do estilo. Usar **exatamente** o texto fornecido
> (sem inventar, traduzir ou trocar palavras) e respeitar a *safe area*.
