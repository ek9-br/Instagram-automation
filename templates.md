# templates.md — Biblioteca de templates

Estruturas narrativas reutilizáveis. O `post-strategist` escolhe **um** template
por job (campo `selected_template`); o `carousel-writer` segue a estrutura de
slides correspondente. O `id` é o valor usado no JSON.

Convenções de slide:
- Slide 1 = **capa/gancho**.
- Último slide = **CTA**.
- Slides intermediários = desenvolvimento conforme o template.

---

## 1. `lista` — Lista
Conteúdo enxuto em itens. Bom para "N dicas/ferramentas/erros".
- Capa: "N [coisas] para [resultado]"
- 1 item por slide (ou agrupados), com microexplicação
- CTA: salvar/compartilhar

## 2. `passo_a_passo` — Passo a passo
Processo sequencial.
- Capa: promessa do resultado final
- Passo 1, 2, 3... (1 por slide, ação clara)
- CTA: aplicar/seguir para tutorial completo

## 3. `pas` — Problema · Agitação · Solução
- Slide 1: Problema (dor real da persona)
- Slide 2: Agitação (consequências de não resolver)
- Slide 3: Solução (sua oferta/método)
- CTA: conversão

## 4. `aida` — Atenção · Interesse · Desejo · Ação
- Atenção: gancho forte
- Interesse: dado/insight
- Desejo: benefício transformador
- Ação: CTA

## 5. `quebra_de_objecao` — Quebra de objeção
- Capa: declara a objeção comum ("Acho que é caro demais")
- Desenvolvimento: rebate com prova/lógica/reframing
- CTA: remover o atrito ("Fale com a gente sem compromisso")

## 6. `antes_e_depois` — Antes e depois
- Capa: a transformação prometida
- Antes: cenário de dor
- Depois: cenário desejado
- Ponte: o que causou a mudança (seu método)
- CTA

## 7. `mitos_e_verdades` — Mitos e verdades
- Capa: "X mitos sobre [tema]"
- 1 mito por slide → marca como Mito/Verdade + explicação curta
- CTA: salvar para não cair no mito

## 8. `estudo_de_caso` — Estudo de caso
- Capa: resultado alcançado (com número, se houver)
- Contexto/desafio
- O que foi feito
- Resultado/prova
- CTA: "quer um resultado assim?"

## 9. `erros_comuns` — Erros comuns
- Capa: "Os N erros que sabotam [resultado]"
- 1 erro por slide + correção
- CTA: checklist/diagnóstico

## 10. `checklist` — Checklist
- Capa: "Checklist para [objetivo]"
- Itens marcáveis (✓), agrupados logicamente
- CTA: salvar e usar

---

### Mapa template → formato recomendado
- **Carrossel (`carousel_3x4`)**: lista, passo_a_passo, mitos_e_verdades,
  erros_comuns, checklist, antes_e_depois, estudo_de_caso.
- **Post único (`post_feed_3x4`)**: pas, aida, quebra_de_objecao (versão
  condensada em 1 arte + caption).
- **Stories/Reels (`stories_9x16`, `reels_cover_9x16`)**: gancho de aida/pas na
  capa; conteúdo desdobrado em sequência curta.
- **Ads (`ads_landscape_1_91_1`)**: aida ou pas, foco em 1 promessa + 1 CTA.
