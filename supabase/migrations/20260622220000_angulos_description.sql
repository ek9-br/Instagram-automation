-- Adiciona uma coluna de descrição/prompt aos ângulos (cada ângulo tem uma
-- instrução longa de como escrever o conteúdo). O front continua usando só o
-- `label`; a `description` alimenta os agentes.

alter table public.angulos add column if not exists description text;
