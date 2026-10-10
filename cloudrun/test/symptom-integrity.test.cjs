const b=require('./helpers.cjs');
module.exports=async()=>{
 const {t,done}=b.suite('Symptom provider score integrity');
 const content='Section: TROUBLESHOOTING E-13 - Engine speed drops\nModel: ZX200-5G\nKategori: TROUBLESHOOTING\nSymptom: Engine speed drops';
 const q={select(){return q},contains(){return q},filter(){return q},limit(){return q},then(f){return Promise.resolve({data:[{id:7000,content}],error:null}).then(f)}};
 let n=0;
 const {d}=b.mockDeps([], {supabase:{from:()=>q},rerank:async()=>++n===1?{source:'google',results:[{index:0,score:.2}]}:{source:'cohere',results:[{index:0,score:.4}]},generate:async()=>{throw Error('fixture verifier unavailable')}});
 b.resetSymptomIndex();
 const r=await b.runWithDeps(d,()=>b.findSymptomSections('ZX200-5G',['engine drops','mesin ngedrop'],'mesin ngedrop','mesin ngedrop'));
 t(r.length===0,'Cohere .40 must not become Google HIGH when verifier fails');
 return done();
};
