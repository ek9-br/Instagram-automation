# ARCHITECTURE.md — Arquitetura futura

Este documento descreve a arquitetura-alvo do post-automation-agent. **Nesta
fase só existem documentos, agentes locais e contratos** — nenhuma integração
está implementada. O agente **roda localmente no PC do usuário** e será
**invocado por uma edge function do Supabase** (não é hospedado no GitHub Pages).

## 1. Visão de alto nível

```
[GitHub Pages]            Front-end estático (planilha + editor visual).
      │                   Cria o job e o grava no Supabase.
      ▼
[Supabase]                Banco (jobs, marcas, lookups) + Storage + Edge Function.
      │  (edge function dispara/entrega o job)
      ▼
[Worker Local]            Processo na máquina do usuário. Faz polling/recebe o
      │                   job, valida contra post-request.schema.json.
      ▼
[Claude Code Agent]       Pipeline de agentes (.claude/agents/*):
      │                   post-strategist → carousel-writer →
      │                   image-prompt-writer → reviewer.
      │                   Produz post-response.schema.json.
      ▼
[OpenAI Images]           Gera as imagens a partir dos image_prompts (gpt-image-1).
      │
      ▼
[Supabase Storage]        Armazena as imagens geradas; URLs voltam para o job.
      │
      ▼
[GitHub Pages]            Front-end exibe o resultado para revisão/edição/aprovação.
```

## 2. Papel de cada camada

| Camada              | Responsabilidade                                                                 | Status nesta fase |
|---------------------|----------------------------------------------------------------------------------|-------------------|
| GitHub Pages        | UI de criação de jobs e editor visual; não executa IA.                           | Não implementado  |
| Supabase (DB)       | Persistir jobs, marcas, personas, lookups; fila/estado do job.                   | Não implementado  |
| Supabase Edge Func. | Ponte segura que aciona o worker local e entrega o job.                          | Não implementado  |
| **Worker Local**    | Orquestra o pipeline, valida contratos, chama OpenAI, sobe ao Storage.           | **Próxima fase**  |
| Claude Code Agents  | Inteligência do sistema (estratégia, escrita, prompts, review).                  | **Esta fase (docs)** |
| OpenAI Images       | Geração das imagens a partir dos prompts.                                         | Não implementado  |
| Supabase Storage    | Guardar as imagens geradas e servir URLs.                                        | Não implementado  |

## 3. Por que o agente fica local

- **Claude Code roda na máquina do usuário** e tem acesso aos arquivos de
  contexto (`brand_bible.md`, `design_system.md`, etc.).
- A edge function do Supabase **não executa o agente** — ela apenas **sinaliza**
  que há um job e o entrega. O processamento pesado e o acesso ao Claude Code
  acontecem localmente.
- Vantagens: sem custo de hospedar o agente, contexto versionado em arquivos,
  e a chave da OpenAI fica no ambiente local/edge, nunca no front.

## 4. Ciclo de um job (futuro)

1. Usuário cria um post no front (GitHub Pages) → grava `post-request` no Supabase.
2. Edge function notifica/entrega o job ao worker local.
3. Worker valida o request (`post-request.schema.json`).
4. Worker executa o pipeline de agentes → monta `post-response`.
5. Para cada `image_prompt`, worker chama OpenAI Images.
6. Imagens geradas → Supabase Storage; URLs anexadas à response.
7. Worker grava a `post-response` no Supabase.
8. Front exibe para revisão/edição/aprovação no editor visual.

## 5. Contratos como fronteira

Os schemas em `schemas/` são o acoplamento entre as camadas:
- O front e a edge function produzem `post-request`.
- O worker + agentes produzem `post-response`.

Trocar qualquer camada (ex.: outro provedor de imagem) não muda os contratos.

## 6. Próxima fase (worker local)

Construir um worker que:
- Recebe jobs do Supabase (polling ou webhook via edge function).
- Valida contra os schemas.
- Encadeia os 4 agentes nesta ordem fixa.
- Integra OpenAI Images e Supabase Storage.
- Persiste a response e atualiza o status do job.

Detalhes de roadmap no `README.md`.
