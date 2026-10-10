const b=require('./helpers.cjs');
module.exports=async()=>{
 const {t,done}=b.suite('Unknown minority evidence is never discarded');const {d}=b.mockDeps([]);
 await b.runWithDeps(d,async()=>{b.registerEvidence([{id:2045,content:'registered manual'}]);const docs=b.evidenceBlocks('registered manual\n\n---\n\nminority pump weight 310 kg');t(docs.some(d=>d.content.includes('minority pump weight 310 kg')),'partial provenance match must not remove unregistered source content');t(docs.length===1 && docs[0].document_id===null,'cannot invent source boundary or id for partially known legacy context')});
 return done();
};
