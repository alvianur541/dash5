const b=require('./helpers.cjs');
module.exports=async()=>{
 const {t,done}=b.suite('Numeric pin score provenance');
 const first='Section: Pump\nPump pressure: 3.9 MPa';
 const minority='Section: Pump specs\nPump weight: 310 kg';
 const {d}=b.mockDeps([], {rerank:async()=>({source:'google',results:[{index:0,score:.2}]})});
 const r=await b.runWithDeps(d,()=>b.rankAndSelect('pump weight',[first,minority],[minority],true,false,4,0));
 const e=r.evidence?.find(e=>e.content===minority);
 t(e?.score===0 && !e.score_source && e.evidence_role==='numeric','unscored keyword pin never borrows top-1 score or provider');
 return done();
};
