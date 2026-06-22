# post-automation-agent

Sistema **local** de geração de posts para Instagram, executado via **Claude
Code**. Um pipeline de agentes transforma um briefing em um pacote pronto para
arte e publicação: estratégia, legenda, slides, prompts de imagem e revisão.

O agente **roda na sua máquina** e, na arquitetura-alvo, será **invocado por uma
edge function do Supabase**. O GitHub Pages será apenas o front-end que cria os
jobs — o agente **não** é hospedado lá. Ver [`docs/ARCHITECTURE.md`](docs/ARCHITECTURE.md).

## Visão geral

- **Entrada:** um `post-request` (JSON) com briefing, marca, formato, objetivo e público.
- **Processo:** 4 agentes em sequência fixa.
- **Saída:** um `post-response` (JSON) validável, com copy, slides, prompts de imagem e review.

## Estrutura do projeto

```
post-automation-agent/
├── CLAUDE.md                     # Regras globais, fluxo, convenções, regras de saída
├── design_system.md              # Sistema visual: safe areas, presets, tipografia, CTA, logo
├── templates.md                  # 10 templates narrativos reutilizáveis
├── brand_bible.md                # Estrutura de identidade de marca (exemplo: Acme)
├── personas.md                   # Estrutura de ICP/persona (exemplo: Marina)
├── .claude/
│   └── agents/
│       ├── post-strategist.md    # Define tema, ângulo, promessa, template
│       ├── carousel-writer.md    # Gera caption, CTA e slides
│       ├── image-prompt-writer.md# Gera image_prompts respeitando o design system
│       └── reviewer.md           # Valida qualidade/consistência/marca/template e status
├── schemas/
│   ├── post-request.schema.json  # Contrato de entrada
│   └── post-response.schema.json # Contrato de saída
├── examples/
│   ├── request.example.json      # Exemplo completo de entrada
│   └── response.example.json     # Exemplo completo de saída
├── docs/
│   └── ARCHITECTURE.md           # Arquitetura futura (GitHub Pages → Supabase → Worker → ...)
└── README.md                     # Este arquivo
```

> Observação: a pasta também contém um protótipo de front-end (Vite/React) e
> arquivos do Supabase de fases anteriores. A estrutura documental acima é o
> núcleo do agente local desta fase.

## Papel de cada arquivo

- **CLAUDE.md** — regras que valem para todos os agentes: JSON obrigatório, fluxo,
  convenções, formatos suportados, regras de saída.
- **design_system.md** — restrições visuais e os 5 presets (Feed 3:4, Carrossel
  3:4, Stories 9:16, Reels Cover 9:16, Ads Landscape 1.91:1).
- **templates.md** — biblioteca de estruturas narrativas (lista, passo a passo,
  PAS, AIDA, quebra de objeção, antes e depois, mitos e verdades, estudo de caso,
  erros comuns, checklist).
- **brand_bible.md** — molde de identidade de marca (missão, valores, tom,
  linguagem, palavras obrigatórias/proibidas, diretrizes visuais).
- **personas.md** — molde de ICP (dores, desejos, objeções, linguagem, gatilhos,
  canais).
- **.claude/agents/** — os 4 agentes do pipeline (ver fluxo abaixo).
- **schemas/** — contratos JSON de entrada e saída.
- **examples/** — um request e um response completos e consistentes com os schemas.
- **docs/ARCHITECTURE.md** — a arquitetura-alvo e o ciclo de um job.

## Fluxo dos agentes

```
post-request.json
   → post-strategist     (theme, angle, promise, target_audience, selected_template)
   → carousel-writer     (caption, cta, slides)
   → image-prompt-writer (image_prompts, safe_area)
   → reviewer            (review, status)
→ post-response.json
```

Cada agente recebe o JSON acumulado e devolve o mesmo objeto acrescido dos seus
campos. Eles não se chamam entre si — quem encadeia é o worker (próxima fase).

## Como validar manualmente

Sem dependências de runtime, nesta fase a validação é por inspeção + JSON Schema:

1. **Validar o request de exemplo** contra o schema. Com [ajv-cli](https://github.com/ajv-validator/ajv-cli):
   ```
   npx ajv-cli validate -s schemas/post-request.schema.json -d examples/request.example.json
   ```
2. **Validar o response de exemplo**:
   ```
   npx ajv-cli validate -s schemas/post-response.schema.json -d examples/response.example.json
   ```
3. **Conferência manual** (checklist):
   - O `selected_template` existe em `templates.md`.
   - O `format` é um dos 5 suportados e a `safe_area` bate com o preset em
     `design_system.md`.
   - Há um `image_prompt` para cada slide (ou um `single`/`cover` para peça única).
   - Nenhuma palavra proibida (`brand_bible.md`) aparece na copy.
   - `review.checks` coerente com `status`.

> Alternativa sem instalar nada: cole schema e exemplo em um validador JSON
> Schema online (ex.: jsonschemavalidator.net).

## Roadmap

- **Estrutura documental e contratos** ✅
- **Worker local** ✅ — polling da fila do Supabase, valida contra os schemas e
  executa os 4 agentes em ordem (pipeline real via `claude` headless, verificado).
- **Supabase DB + Edge Functions** ✅ — migrations da fila de jobs, `create-job`,
  `generate-image`, `apply-safeguard` (deploy das functions a confirmar).
- **Supabase Storage** ✅ — bucket `generated-images`.
- **OpenAI Images** 🟡 — edge function `generate-image` pronta; integração no
  worker via flag `GENERATE_IMAGES` (requer function deployada + `OPENAI_API_KEY`
  como secret no Supabase).
- **Front-end (GitHub Pages)** 🟡 — app Vite/React com auth pronto; build OK;
  deploy no GitHub Pages pendente.
- **Publicação no Instagram** ⬜ — integração com a API do Instagram (não iniciado).
