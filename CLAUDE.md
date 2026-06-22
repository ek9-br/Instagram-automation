# CLAUDE.md — Regras globais do post-automation-agent

Este projeto é um **sistema local de geração de posts para Instagram** executado
via Claude Code. Os agentes rodam na máquina do usuário e são orquestrados por
um worker local que, futuramente, receberá *jobs* de uma edge function do
Supabase. **Nada aqui é publicado no GitHub Pages** — o GitHub Pages será apenas
o front-end que cria os jobs.

## 1. Princípios globais

1. **JSON é o contrato.** Toda comunicação entre agentes e a saída final do
   sistema são objetos JSON válidos que respeitam os schemas em `schemas/`.
2. **Determinismo de pipeline.** Os agentes não se chamam entre si. Um
   orquestrador (worker local) os executa em ordem fixa e passa o estado adiante.
3. **Fonte única de verdade visual e de marca.** Os agentes devem obedecer a
   `design_system.md`, `brand_bible.md`, `templates.md` e `personas.md`.
4. **Sem invenção de dados.** Se uma informação não está no briefing nem nos
   arquivos de contexto, o agente deve marcá-la como suposição no campo de review,
   nunca inventar fatos sobre a marca ou números.

## 2. Fluxo entre agentes

```
post-request.json (valida contra post-request.schema.json)
        │
        ▼
[post-strategist]    → tema, ângulo, promessa, template selecionado
        │
        ▼
[carousel-writer]    → caption, cta, slides (narrativa por slide)
        │
        ▼
[image-prompt-writer]→ image_prompts (1 por slide/peça) + safe_area
        │
        ▼
[reviewer]           → review (qualidade, consistência, marca, template) + status
        │
        ▼
post-response.json (valida contra post-response.schema.json)
```

Cada agente **recebe** o JSON acumulado até o seu passo e **devolve** o mesmo
objeto acrescido dos campos sob sua responsabilidade. O worker é quem persiste
e encadeia.

## 3. Convenções

- **Idioma do conteúdo:** português do Brasil, salvo indicação contrária no
  briefing.
- **Formatos suportados** (campo `format`):
  `post_feed_3x4`, `carousel_3x4`, `stories_9x16`, `reels_cover_9x16`,
  `ads_landscape_1_91_1`.
- **Identificadores:** `job_id` é um UUID gerado pelo solicitante (futuramente o
  Supabase). Os agentes nunca alteram o `job_id`.
- **Referências cruzadas:** slides são numerados a partir de `1`. Cada
  `image_prompt` aponta para o slide via `target` (ex.: `"slide:1"`, `"cover"`,
  `"single"`).
- **Nomes de arquivo:** kebab-case. Schemas terminam em `.schema.json`.

## 4. Regras de saída (obrigatórias)

1. A saída final de um job é **um único objeto JSON** conforme
   `post-response.schema.json`.
2. **Proibido** texto fora do JSON, comentários, crases de markdown
   (```` ``` ````) ou prosa explicativa na saída final.
3. Todo campo `required` do schema deve estar presente e não-vazio.
4. Strings não devem conter quebras de linha cruas que invalidem o JSON — usar
   `\n` quando necessário.
5. Se o agente não conseguir cumprir o contrato, ele deve ainda assim emitir um
   JSON válido com `status: "rejected"` e o motivo em `review.issues`.

## 5. Validação

Antes de considerar um job concluído:
- O request valida contra `schemas/post-request.schema.json`.
- A response valida contra `schemas/post-response.schema.json`.
- O `reviewer` deve ter rodado e preenchido `review` e `status`.

Ver `README.md` (seção "Como validar manualmente") para o passo a passo.

---

> **Nota de histórico:** este projeto foi separado de um repositório que também
> continha um pipeline de **artigos de SEO (Coalize)**. Aquele pipeline permanece
> no projeto original (`~/mkt-agents/post-automation-agent`). Este repositório é
> **exclusivamente** a automação de **posts do Instagram**.
