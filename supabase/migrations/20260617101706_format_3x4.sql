-- Proporção 4:5 → 3:4 (1080x1440). Atualiza dados existentes e a constraint.
-- Dropa a constraint antiga ANTES de migrar os dados (a antiga não permite 3x4).

alter table public.jobs drop constraint if exists jobs_format_check;

update public.jobs set format = 'post_feed_3x4' where format = 'post_feed_4x5';
update public.jobs set format = 'carousel_3x4'  where format = 'carousel_4x5';

alter table public.jobs add constraint jobs_format_check
  check (format in (
    'post_feed_3x4',
    'carousel_3x4',
    'stories_9x16',
    'reels_cover_9x16',
    'ads_landscape_1_91_1'
  ));
