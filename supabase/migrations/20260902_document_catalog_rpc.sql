create or replace function public.document_catalog()
returns table (model text, kategori text, count integer)
language sql
stable
security definer
set search_path = public
as $$
  select
    metadata->>'Model'    as model,
    metadata->>'Kategori' as kategori,
    count(*)::int         as count
  from documents
  where metadata->>'Model' is not null
    and metadata->>'Kategori' is not null
  group by 1, 2
  order by 1, 2;
$$;

revoke all on function public.document_catalog() from public, anon;
grant execute on function public.document_catalog() to authenticated, service_role;
