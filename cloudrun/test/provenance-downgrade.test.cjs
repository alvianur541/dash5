const b=require('./helpers.cjs');
module.exports=async()=>{
 const {t,done}=b.suite('No provenance laundering or downgrade');const {d}=b.mockDeps([]);
 await b.runWithDeps(d,async()=>{b.registerEvidence([{id:2045,content:'literal manual',metadata:{Model:'ZX138MF-5G'}}]);b.registerEvidence([{content:'literal manual'}]);t(b.evidenceFor('literal manual').document_id===2045,'keyword RPC without id cannot erase a known source id')});
 return done();
};
