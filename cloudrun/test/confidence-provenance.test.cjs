const b = require('./helpers.cjs');
const rows = [{ id:9590, content:'Section: CYLINDER LIFT ARM\nModel: ZW140\nKategori: PARTS CATALOG\n01 | 263E8-47231 | SEAL KIT | qty:1', metadata:{Model:'ZW140',Kategori:'PARTS CATALOG'}, similarity:.8 }];
const db = () => { const q={ select(){return q},contains(){return q},ilike(){return q},filter(){return q},limit(){return q},or(){return q},then(f){return Promise.resolve({data:rows,error:null}).then(f)} }; return {from:()=>q,rpc:async()=>({data:rows,error:null})}; };
module.exports = async () => {
 const {t,done}=b.suite('Confidence provenance (offline providers)');
 const {d}=b.mockDeps([], {supabase:db(),embed:async()=>[.1],rerank:async(_q,docs)=>({results:docs.map((_,index)=>({index,score:.2})),source:'google'}),generate:async()=>({candidates:[{content:{parts:[{text:'["lift cylinder part number", "lift cylinder seal kit price"]'}]}}]})});
 const r=await b.runWithDeps(d,()=>b.resolvePartsQuery('part number lift cylinder',[],'ZW140',undefined,'lift cylinder part number',false));
 t(r.confidence==='medium' && r.evidence?.[0]?.document_id===9590,'parts preserve confidence and actual document id');
 const m=await b.runWithDeps(d,()=>b.resolveMultiAspectQuery('part number lift cylinder dan seal kit',[],'ZW140'));
 t(m.aspectConfidence?.length===2 && m.aspectConfidence.every(a=>a.status==='found'),'shared evidence supports both aspects, not a false missing after dedupe');
 t(m.confidence && m.evidence?.length>0,'multi-aspect preserves confidence and document boundaries');
 return done();
};
