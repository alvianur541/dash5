-- Model isolation: a query filtered to one Model must never return another model's chunk.
-- Uses each model's own first chunk embedding as the query vector (doc-to-doc), so the
-- test is deterministic and needs no external embedding call. Expect `bocor = 0` on every row.
with model_list as (
  select distinct metadata->>'Model' as model from documents
),
probe as (
  select m.model,
         (select embedding from documents d where d.metadata->>'Model' = m.model order by d.id limit 1) as emb
  from model_list m
)
select p.model,
       count(*)                                            as hasil,
       count(*) filter (where r.metadata->>'Model' <> p.model) as bocor
from probe p
cross join lateral match_documents_hybrid(
  'swing motor', p.emb, 20, jsonb_build_object('Model', p.model), 0
) r
group by p.model
order by p.model;
