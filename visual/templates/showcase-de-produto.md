# Template: Showcase de produto

**Só estrutura/disposição.** Não define cores, fontes nem acabamento (isso vem do
estilo). Layout "hero" em camadas, com produto em destaque.

Match com o banco: label `Showcase de produto`.

## Visão geral
Composição em camadas (mais densa que os outros templates):
- **Texto** no **topo-esquerda**.
- **Mockups de produto flutuantes** no **topo/centro-direita**.
- **Pessoa** na **base**, sobre uma **foto de contexto** (cenário real).
- **Card de notificação** flutuante como detalhe.

## Camadas / disposição
1. **Topo-esquerda (texto):** logo → **headline** (pode ter linha de ênfase) →
   **subtítulo** (1–2 linhas) → **divisor** curto. Mantém a área superior-esquerda
   limpa.
2. **Topo/centro-direita (mockups flutuantes):** uma **janela de navegador**
   (dashboard) **e** um **card de app/celular** sobrepostos, flutuando; podem
   **sangrar/cortar** na borda direita e sobrepor levemente o centro.
3. **Base (pessoa + contexto):** **pessoa** (meio corpo) ancorada na parte de baixo,
   sobre uma **foto de contexto** (cenário real, ex.: ambiente de trabalho/fábrica)
   que preenche a faixa inferior. A foto entra numa **moldura curva/circular** que
   separa a área superior (limpa) da cena de baixo.
4. **Card de notificação** pequeno sobreposto (ex.: aviso "Olá, …"), normalmente no
   canto **inferior-esquerdo**.
5. **Decoração:** **formas** (círculo/curvas) e **pontilhados** ao fundo.

## Regras de disposição
- Texto sempre no **topo-esquerda**; não é coberto pelos mockups nem pela pessoa.
- Mockups **flutuam à direita/centro**, podem sobrepor e sangrar na borda.
- A **pessoa fica embaixo**, dentro da foto de contexto (moldura curva), sem subir
  até o texto.
- Card de notificação é um **overlay pequeno**, não compete com o headline.
- Respeitar **safe area** (salvo elementos que sangram de propósito).
- A **foto/IA** gera a **cena com a pessoa no contexto**; **mockups de UI, cards,
  logo e os textos do post são elementos de layout montados por cima** (não embutir
  o texto do post na foto).
