import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {execFileSync} from 'node:child_process';
const require=createRequire(import.meta.url);
const {PGlite}=require(process.env.PGLITE_MODULE || '@electric-sql/pglite');
for (const ready of [false,true]) {
  const db=new PGlite();
  await db.exec(`CREATE TABLE usage_logs(user_name text,user_nik text,model text,created_at timestamptz ${ready?',user_id uuid,is_internal boolean':''});`);
  const synthetic=[['Same display','a','11111111-1111-4111-8111-111111111111',false],['Same display','b','22222222-2222-4222-8222-222222222222',false],['Internal fixture','c','33333333-3333-4333-8333-333333333333',true],['Unknown fixture','d',null,null],['LOADTEST','e',null,false]];
  for(const [name,prefix,id,internal] of synthetic) {
    await db.query(ready?'INSERT INTO usage_logs VALUES($1,$2,$3,now(),$4,$5)':'INSERT INTO usage_logs VALUES($1,$2,$3,now())',ready?[name,prefix,'unit fixture',id,internal]:[name,prefix,'unit fixture']);
  }
  const code=`import sys,json;sys.path.insert(0,'ops/mission-control');from adoption import read_adoption\nqueries=[]\ndef rows(q):\n if 'information_schema.columns' in q:return ${ready?"[{'column_name':'user_id'},{'column_name':'is_internal'}]":"[]"}\n queries.append(q);return []\nread_adoption(rows);print(json.dumps(queries))`;
  const queries=JSON.parse(execFileSync('python3',['-c',code],{encoding:'utf8'}));
  const results=[];
  for(const sql of queries) results.push((await db.query(sql)).rows);
  const stride=ready?6:5;
  assert.equal(Number(results[0][0].d7),ready?2:4);
  assert.equal(Number(results[0][0].users7),ready?2:4,'same display names count as distinct identities');
  assert.equal(Number(results[stride][0].d7),4,'include retains LOADTEST exclusion');
  if(ready) assert.equal(Number(results[5][0].n),1,'unclassified disclosed');
  await db.close();
}
console.log('isolated PGlite adoption SQL: legacy/new schema, external/internal/unknown/LOADTEST, auth-ID counts passed');
