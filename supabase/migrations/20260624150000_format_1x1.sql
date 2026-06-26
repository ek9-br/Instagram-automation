-- Adiciona os formatos 1:1 (post_feed_1x1 / carousel_1x1) ao check de jobs.format.
-- Sem a atualização, o insert do create-job falha (23514) e a peça sai como 3x4.

alter table public.jobs drop constraint if exists jobs_format_check;

alter table public.jobs add constraint jobs_format_check
  check (format in (
    'post_feed_3x4',
    'post_feed_1x1',
    'carousel_3x4',
    'carousel_1x1',
    'stories_9x16',
    'reels_cover_9x16',
    'ads_landscape_1_91_1'
  ));
