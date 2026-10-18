-- PARKED MIGRATION: review and test in an isolated Supabase branch before applying.
-- This file is intentionally committed without being run against production.
begin;

create schema if not exists dash5_private;
revoke all on schema dash5_private from public, anon, authenticated;

-- The no-login function owner can traverse private graph data, but ordinary API roles cannot assume it.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'dash5_kg_rpc') then
    execute 'create role dash5_kg_rpc nologin inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls';
  end if;
end;
$$;
alter role dash5_kg_rpc nologin inherit nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
grant authenticated to dash5_kg_rpc;
grant usage on schema dash5_private to dash5_kg_rpc;

create table if not exists public.kg_extraction_runs (
  id bigint generated always as identity primary key,
  run_key text not null unique,
  extractor_version text not null,
  model_name text not null,
  scope jsonb not null default '{}'::jsonb,
  status text not null default 'running' check (status in ('running', 'completed', 'failed', 'cancelled')),
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  documents_processed integer not null default 0 check (documents_processed >= 0),
  entities_proposed integer not null default 0 check (entities_proposed >= 0),
  relations_proposed integer not null default 0 check (relations_proposed >= 0),
  relations_verified integer not null default 0 check (relations_verified >= 0),
  errors jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (completed_at is null or completed_at >= started_at)
);

create table if not exists public.kg_entities (
  id bigint generated always as identity primary key,
  entity_type text not null check (entity_type in (
    'UNIT_MODEL', 'SYSTEM', 'COMPONENT', 'FAULT_CODE', 'SYMPTOM', 'CAUSE',
    'INSPECTION', 'PROCEDURE', 'PART_NUMBER', 'SERVICE_INTERVAL', 'SPECIFICATION',
    'TECHNICAL_BULLETIN', 'SERIAL_RANGE', 'OH_PACKAGE', 'DOCUMENT_SECTION'
  )),
  canonical_name text not null check (length(btrim(canonical_name)) between 1 and 300),
  normalized_key text not null check (length(btrim(normalized_key)) between 1 and 300),
  model_scope text,
  properties jsonb not null default '{}'::jsonb,
  status text not null default 'candidate' check (status in ('candidate', 'verified', 'rejected', 'deprecated')),
  extraction_run_id bigint references public.kg_extraction_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists kg_entities_identity_uidx
  on public.kg_entities (entity_type, normalized_key, coalesce(model_scope, ''));
create index if not exists kg_entities_verified_lookup_idx
  on public.kg_entities (model_scope, entity_type, normalized_key) where status = 'verified';

create table if not exists public.kg_entity_aliases (
  id bigint generated always as identity primary key,
  entity_id bigint not null references public.kg_entities(id) on delete cascade,
  alias text not null check (length(btrim(alias)) between 1 and 300),
  normalized_alias text not null check (length(btrim(normalized_alias)) between 1 and 300),
  language text check (language is null or language ~ '^[a-z]{2,3}(-[A-Z]{2})?$'),
  source_document_id bigint references public.documents(id) on delete restrict,
  status text not null default 'candidate' check (status in ('candidate', 'verified', 'rejected', 'deprecated')),
  extraction_run_id bigint references public.kg_extraction_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (entity_id, normalized_alias)
);
create index if not exists kg_entity_aliases_verified_lookup_idx
  on public.kg_entity_aliases (normalized_alias, entity_id) where status = 'verified';

create table if not exists public.kg_relations (
  id bigint generated always as identity primary key,
  subject_entity_id bigint not null references public.kg_entities(id) on delete cascade,
  relation_type text not null check (relation_type in (
    'HAS_SYSTEM', 'HAS_COMPONENT', 'APPLIES_TO_MODEL', 'APPLIES_TO_SERIAL_RANGE',
    'INDICATES_COMPONENT', 'SHOWS_SYMPTOM', 'MAY_BE_CAUSED_BY', 'CHECK_WITH',
    'RESOLVED_BY', 'DOCUMENTED_IN', 'USES_PART', 'REPLACED_BY', 'REQUIRES_PART',
    'CONTAINS_PART', 'HAS_SPECIFICATION', 'RELATED_TO_FAULT_CODE'
  )),
  object_entity_id bigint not null references public.kg_entities(id) on delete cascade,
  model_scope text,
  properties jsonb not null default '{}'::jsonb,
  confidence numeric(5,4) check (confidence is null or confidence between 0 and 1),
  status text not null default 'candidate' check (status in ('candidate', 'verified', 'rejected', 'deprecated')),
  extraction_run_id bigint references public.kg_extraction_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (subject_entity_id <> object_entity_id)
);
create unique index if not exists kg_relations_identity_uidx
  on public.kg_relations (subject_entity_id, relation_type, object_entity_id, coalesce(model_scope, ''));
create index if not exists kg_relations_verified_subject_idx
  on public.kg_relations (subject_entity_id, model_scope, relation_type) where status = 'verified';
create index if not exists kg_relations_verified_object_idx
  on public.kg_relations (object_entity_id, model_scope, relation_type) where status = 'verified';

create table if not exists public.kg_relation_evidence (
  id bigint generated always as identity primary key,
  relation_id bigint not null references public.kg_relations(id) on delete cascade,
  document_id bigint not null references public.documents(id) on delete restrict,
  source_quote text not null check (length(btrim(source_quote)) between 1 and 4000),
  section text,
  evidence_role text not null default 'supporting' check (evidence_role in (
    'supporting', 'procedure', 'numeric', 'serial_bulletin', 'part', 'fault_code'
  )),
  verified boolean not null default false,
  extraction_run_id bigint references public.kg_extraction_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (relation_id, document_id, source_quote)
);
create index if not exists kg_relation_evidence_verified_doc_idx
  on public.kg_relation_evidence (relation_id, document_id) where verified;

create table if not exists public.kg_entity_mentions (
  id bigint generated always as identity primary key,
  entity_id bigint not null references public.kg_entities(id) on delete cascade,
  document_id bigint not null references public.documents(id) on delete restrict,
  mention_text text not null check (length(btrim(mention_text)) between 1 and 1000),
  section text,
  start_offset integer check (start_offset is null or start_offset >= 0),
  end_offset integer check (end_offset is null or end_offset >= 0),
  verified boolean not null default false,
  extraction_run_id bigint references public.kg_extraction_runs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (start_offset is null or end_offset is null or end_offset >= start_offset)
);
create unique index if not exists kg_entity_mentions_identity_uidx
  on public.kg_entity_mentions (entity_id, document_id, coalesce(start_offset, -1), coalesce(end_offset, -1), mention_text);
create index if not exists kg_entity_mentions_verified_entity_idx
  on public.kg_entity_mentions (entity_id, document_id) where verified;

create or replace function dash5_private.kg_set_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;
revoke all on function dash5_private.kg_set_updated_at() from public, anon, authenticated;
grant execute on function dash5_private.kg_set_updated_at() to service_role;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'kg_extraction_runs', 'kg_entities', 'kg_entity_aliases', 'kg_relations',
    'kg_relation_evidence', 'kg_entity_mentions'
  ] loop
    execute format('drop trigger if exists kg_touch_updated_at on public.%I', table_name);
    execute format(
      'create trigger kg_touch_updated_at before update on public.%I for each row execute function dash5_private.kg_set_updated_at()',
      table_name
    );
  end loop;
end;
$$;

alter table public.kg_entities enable row level security;
alter table public.kg_entity_aliases enable row level security;
alter table public.kg_relations enable row level security;
alter table public.kg_relation_evidence enable row level security;
alter table public.kg_entity_mentions enable row level security;
alter table public.kg_extraction_runs enable row level security;

revoke all on table public.kg_entities, public.kg_entity_aliases, public.kg_relations,
  public.kg_relation_evidence, public.kg_entity_mentions, public.kg_extraction_runs
  from public, anon, authenticated;
grant all on table public.kg_entities, public.kg_entity_aliases, public.kg_relations,
  public.kg_relation_evidence, public.kg_entity_mentions, public.kg_extraction_runs
  to service_role;
grant usage, select on sequence public.kg_entities_id_seq, public.kg_entity_aliases_id_seq,
  public.kg_relations_id_seq, public.kg_relation_evidence_id_seq,
  public.kg_entity_mentions_id_seq, public.kg_extraction_runs_id_seq to service_role;

-- This definer helper is callable only by the no-login RPC owner, never by ordinary API roles.
create or replace function dash5_private.search_knowledge_graph_document_ids(
  p_query text,
  p_model text,
  p_match_count integer
)
returns table(document_id bigint, graph_score double precision)
language sql
stable
security definer
set search_path = ''
as $$
  with query_input as (
    select lower(btrim(p_query)) as q, greatest(1, least(coalesce(p_match_count, 8), 12)) as n
  ),
  anchors as (
    select e.id,
      case
        when lower(e.canonical_name) = qi.q then 6.0
        when position(qi.q in lower(e.canonical_name)) > 0 or position(lower(e.canonical_name) in qi.q) > 0 then 4.0
        else 2.0
      end as score
    from public.kg_entities e
    cross join query_input qi
    where e.status = 'verified'
      and (e.model_scope is null or e.model_scope = p_model)
      and (
        position(qi.q in lower(e.canonical_name)) > 0
        or position(lower(e.canonical_name) in qi.q) > 0
        or exists (
          select 1 from public.kg_entity_aliases a
          where a.entity_id = e.id and a.status = 'verified'
            and (position(qi.q in lower(a.alias)) > 0 or position(lower(a.alias) in qi.q) > 0)
        )
      )
    order by score desc, e.id
    limit 8
  ),
  one_hop as (
    select a.id as entity_id, a.score from anchors a
    union all
    select case when r.subject_entity_id = a.id then r.object_entity_id else r.subject_entity_id end,
      a.score + 1.0
    from anchors a
    join public.kg_relations r
      on (r.subject_entity_id = a.id or r.object_entity_id = a.id)
    where r.status = 'verified'
      and (r.model_scope is null or r.model_scope = p_model)
      and exists (
        select 1 from public.kg_relation_evidence ev
        where ev.relation_id = r.id and ev.verified
      )
  ),
  direct_documents as (
    select m.document_id, max(h.score + 1.0) as score
    from one_hop h
    join public.kg_entities e on e.id = h.entity_id and e.status = 'verified'
      and (e.model_scope is null or e.model_scope = p_model)
    join public.kg_entity_mentions m on m.entity_id = h.entity_id and m.verified
    group by m.document_id
  ),
  relation_documents as (
    select ev.document_id, max(a.score + 2.0) as score
    from anchors a
    join public.kg_relations r
      on (r.subject_entity_id = a.id or r.object_entity_id = a.id)
      and r.status = 'verified'
      and (r.model_scope is null or r.model_scope = p_model)
    join public.kg_entities subject on subject.id = r.subject_entity_id and subject.status = 'verified'
      and (subject.model_scope is null or subject.model_scope = p_model)
    join public.kg_entities object on object.id = r.object_entity_id and object.status = 'verified'
      and (object.model_scope is null or object.model_scope = p_model)
    join public.kg_relation_evidence ev on ev.relation_id = r.id and ev.verified
    group by ev.document_id
  ),
  combined as (
    select document_id, max(score) as score
    from (
      select * from direct_documents
      union all
      select * from relation_documents
    ) candidates
    group by document_id
  )
  select c.document_id, c.score::double precision
  from combined c
  cross join query_input qi
  order by c.score desc, c.document_id
  limit (select n from query_input);
$$;
revoke all on function dash5_private.search_knowledge_graph_document_ids(text, text, integer) from public, anon, authenticated;
grant execute on function dash5_private.search_knowledge_graph_document_ids(text, text, integer) to dash5_kg_rpc;

-- service_role normally bypasses documents RLS; keep that behavior without exposing this path to authenticated.
create or replace function dash5_private.search_knowledge_graph_service_documents(
  p_query text,
  p_model text,
  p_match_count integer
)
returns table(id bigint, content text, metadata jsonb, graph_score double precision)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.content, d.metadata, g.graph_score
  from dash5_private.search_knowledge_graph_document_ids(p_query, p_model, p_match_count) g
  join public.documents d on d.id = g.document_id
  where d.metadata->>'Model' = p_model
  order by g.graph_score desc, d.id
  limit greatest(1, least(coalesce(p_match_count, 8), 12));
$$;
revoke all on function dash5_private.search_knowledge_graph_service_documents(text, text, integer) from public, anon, authenticated, service_role;
grant execute on function dash5_private.search_knowledge_graph_service_documents(text, text, integer) to dash5_kg_rpc;

create or replace function public.search_knowledge_graph(
  p_query text,
  p_model text,
  p_match_count integer default 8
)
returns table(id bigint, content text, metadata jsonb, graph_score double precision)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if p_query is null or length(btrim(p_query)) = 0 then
    raise exception 'p_query must not be blank' using errcode = '22023';
  end if;
  if length(p_query) > 500 then
    raise exception 'p_query exceeds 500 characters' using errcode = '22023';
  end if;
  if p_model is null or length(btrim(p_model)) = 0 or length(p_model) > 100 then
    raise exception 'p_model is invalid' using errcode = '22023';
  end if;

  if (select auth.role()) = 'service_role' then
    return query
    select s.id, s.content, s.metadata, s.graph_score
    from dash5_private.search_knowledge_graph_service_documents(
      p_query, p_model, greatest(1, least(coalesce(p_match_count, 8), 12))
    ) s;
    return;
  end if;

  return query
  select d.id, d.content, d.metadata, g.graph_score
  from dash5_private.search_knowledge_graph_document_ids(p_query, p_model, greatest(1, least(coalesce(p_match_count, 8), 12))) g
  join public.documents d on d.id = g.document_id
  where d.metadata->>'Model' = p_model
  order by g.graph_score desc, d.id
  limit greatest(1, least(coalesce(p_match_count, 8), 12));
end;
$$;
grant select on table public.documents to dash5_kg_rpc;
revoke all on function public.search_knowledge_graph(text, text, integer) from public, anon;
grant execute on function public.search_knowledge_graph(text, text, integer) to authenticated, service_role;

comment on function public.search_knowledge_graph(text, text, integer) is
  'Parked KG pilot RPC: verified, evidence-linked, model-scoped, bounded one-hop retrieval. Authenticated calls run as a no-login member of authenticated, so documents RLS remains authoritative; service_role retains its normal bypass.';

grant create on schema public to dash5_kg_rpc;
alter function public.search_knowledge_graph(text, text, integer) owner to dash5_kg_rpc;
revoke create on schema public from dash5_kg_rpc;

commit;
