begin;

delete from documents
where id in (5933, 5934, 6194, 6195, 7188, 7189, 7516, 7517)
  and metadata->>'Kategori' = 'OPERATOR MANUAL'
  and content ~ '^Chapter:[^\n]*\nTopic: (CONTENTS|INDEX)\n';

delete from documents
where id in (892, 903, 1820, 1831, 1972, 2192)
  and length(content) < 120;

update documents
set content = regexp_replace(content, 'qty:([0-9]+)([0-9]{6}-[0-9-]*)', 'qty:\1 | s/n:\2', 'g')
where metadata->>'Kategori' = 'PARTS CATALOG'
  and content ~ 'qty:[0-9]+[0-9]{6}-';

update documents
set content = replace(content, 'qty:997400', 'qty:-')
where id = 6682
  and content like '%4610138%MOTOR;OIL%qty:997400%';

commit;

select count(*) as total_chunk,
       count(*) filter (where content ~ 'qty:[0-9]{5,}') as chunk_qty_rusak,
       count(*) filter (where content ~ 'Topic: (CONTENTS|INDEX)') as chunk_daftar_isi
from documents;
