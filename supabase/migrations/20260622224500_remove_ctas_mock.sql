-- Remove os CTAs-mock antigos do seed, deixando só os CTAs da Coalize.

delete from public.ctas
where label in ('Comente abaixo', 'Compre agora', 'Saiba mais', 'Salve o post');
