-- Coluna de descrição (framework de copy) + os 9 frameworks de legenda da Coalize.
-- O front usa só o label; a description é a mecânica do framework (para os agentes).

alter table public.legendas add column if not exists description text;

insert into public.legendas (label, description)
select label, description from (values
  ('PAS — Problema → Agitação → Solução',
   'Nomeia a dor → Amplia o problema → Traz a virada. Use quando: dor clara, público em consciência 2–3. Funciona em estático e carrossel.'),
  ('CPP — Conscientização → Problema → Posicionamento',
   'Apresenta o problema → Mostra o impacto real → Apresenta o diferencial. Use quando: público ainda está entendendo o problema (consciência 2). Carrossel e reels.'),
  ('AIDA — Atenção → Interesse → Desejo → Ação',
   'Gancha → Gera interesse → Desperta desejo → Convida à ação. Use quando: peça com objetivo claro de conversão ou CTA direto.'),
  ('PADS — Problema → Agitação → Demonstração → Solução',
   'Nomeia → Amplifica → Demonstra na prática → Resolve. Use quando: o produto ou serviço precisa ser demonstrado antes de ser vendido.'),
  ('4Ps — Problema → Promessa → Prova → Proposta',
   'Problema → Promessa clara → Prova (dado, caso, depoimento) → Proposta de ação. Use quando: peça de conversão com necessidade de credibilidade.'),
  ('BAB — Before → After → Bridge',
   'Como é a vida antes → Como pode ser depois → A ponte entre os dois (produto/conteúdo). Use quando: o benefício precisa virar imagem mental rápida. Ótimo para reels e estático.'),
  ('Star–Story–Solution',
   'Personagem cativante → História envolvente → Solução como desfecho. Use quando: storytelling é o veículo. Funciona muito em vídeos e reels.'),
  ('Regra do Um',
   'Um público. Um benefício. Uma promessa. Uma ação. Use quando: a copy está poluída com muitas mensagens. Simplifica e direciona.'),
  ('FAB — Feature → Advantage → Benefit',
   'Característica → O que faz de melhor → O que o cliente realmente ganha. Use quando: precisa traduzir linguagem técnica em benefício real.')
) as t(label, description)
where not exists (select 1 from public.legendas l where l.label = t.label);
