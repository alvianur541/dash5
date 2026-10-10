const b=require('./helpers.cjs');
const gold=require('./fixtures/prompt-rerank-gold.json');
module.exports=async()=>{
 const {t,done}=b.suite('Sanitized source-adjudicated case ledger');
 t(gold.cases.length===60 && new Set(gold.cases.map(c=>c.id)).size===60,'60 uniquely identified derived cases, not claimed independent human gold');
 t(gold.cases.filter(c=>['supported','contradicted'].includes(c.label)).every(c=>c.evidence.length && c.evidence.every(e=>c.document_ids.includes(e.document_id) && e.quote)),'every positive/contradicted label carries exact source excerpt and id');
 t(gold.cases.filter(c=>c.input_kind==='photo_missing_input').length===7 && gold.cases.filter(c=>c.input_kind==='photo_missing_input').every(c=>c.label==='missing' && c.document_ids.length===0),'seven photos are explicitly missing input, no fabricated OCR results');
 t(gold.cases.filter(c=>c.family==='oh_main_pump'&&c.label==='supported').length===16,'all 16 OH rows represented, no item or qty dropped');
 t(!JSON.stringify(gold).match(/@[a-z0-9.-]+\.[a-z]{2,}|session_id|user_nik|attachment_url/i),'no account or attachment identifiers');
 const families=new Map(); for(const c of gold.cases){const s=families.get(c.family)??new Set();s.add(c.split);families.set(c.family,s)}
 t([...families.values()].every(s=>s.size===1),'family-disjoint regression/holdout split (source adjudication, not calibrated accuracy)');
 return done();
};
