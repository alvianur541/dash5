const b=require('./helpers.cjs');
module.exports=async()=>{
 const {t,done}=b.suite('Keyword-only document provenance recovery');
 const text='Section: Pump weight\nModel: ZX200-5G\nKategori: WORKSHOP MANUAL\nPump weight: 310 kg';
 const q={select(){return q},contains(){return q},in(){return q},then(f){return Promise.resolve({data:[{id:7605,content:text,metadata:{Model:'ZX200-5G',Kategori:'WORKSHOP MANUAL'}}],error:null}).then(f)}};
 const {d}=b.mockDeps([], {supabase:{from:()=>q},rerank:async()=>({source:'google',results:[{index:0,score:.8}]})});
 const r=await b.runWithDeps(d,()=>b.rankAndSelect('pump weight',[text],[text],true,false,4,0));
 t(r.evidence?.[0]?.document_id===7605,'RPC without id recovers exact selected content through caller client');
 return done();
};
