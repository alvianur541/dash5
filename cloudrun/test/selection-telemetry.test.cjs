const b=require('./helpers.cjs');
module.exports=async()=>{
 const {t,done}=b.suite('Selection and DB telemetry execute');
 const text='Section: Pump\nModel: ZX200-5G\nPump pressure 2 MPa';
 const row={id:18,content:text,metadata:{Model:'ZX200-5G'}};
 const q={select(){return q},in(){return q},contains(){return q},then(f){return Promise.resolve({data:[row]}).then(f)}};
 const {d}=b.mockDeps([],{requestId:'fixture-rid',supabase:{from:()=>q},rerank:async()=>({source:'google',results:[{index:0,score:.8}]})});
 await b.runWithDeps(d,()=>b.rankAndSelect('pump pressure',[text],[text],true,false,4,0));
 t(d.meta.stages?.some(e=>e.stage==='selection'&&e.document_count===1),'actual selection span reports source document count');
 t(d.meta.stages?.some(e=>e.stage==='db_search'),'id recovery exposes DB span');
 return done();
};
