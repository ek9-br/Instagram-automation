# visual/ — Regras de Template e Estilo por peça

Estes arquivos são **contexto** lido pelo worker na hora de gerar o prompt de
imagem (fluxo de posts/carrosséis/criativo no JobResult). Quando o usuário
escolhe um **Template** e um **Estilo** em cada box, o worker lê o `.md`
correspondente e injeta as regras no prompt enviado ao Claude (junto com
`design_system.md` e `brand_bible.md`).

## Divisão de responsabilidade
- **`templates/`** — **disposição**: onde ficam o texto, a imagem e os botões/CTA;
  alinhamento, hierarquia, áreas reservadas.
- **`estilos/`** — **cores e acabamento**: cor de fundo, cor de botões/CTA, cor do
  texto, overlays/transparências, contraste.

> Um template define o **layout**; um estilo define a **paleta/acabamento**. Os
> dois se combinam na mesma peça.

## Convenção de nome de arquivo (slug)
O nome do arquivo é o **label** (da tabela `templates` / da lista de estilos)
em *slug*: minúsculas, sem acento, e tudo que não é letra/número vira `-`.

Exemplos:
- Template "Imagem de fundo - Texto na esquerda" → `templates/imagem-de-fundo-texto-na-esquerda.md`
- Estilo "Azul escuro" → `estilos/azul-escuro.md`

Se um template/estilo não tiver `.md`, o worker simplesmente não injeta regra
extra (usa só o label + design_system/brand_bible).

## Como adicionar um novo
1. Crie a opção (template na tabela `templates`; estilo em `ESTILOS` no código).
2. Crie o `.md` aqui com o slug correspondente.

> Os rascunhos atuais são um ponto de partida — **edite à vontade** com as regras
> reais de cada peça.
