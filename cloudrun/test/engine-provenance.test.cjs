const b=require('./helpers.cjs');
module.exports=async()=>{
 const {t,done}=b.suite('Engine section pin keeps source id');
 const row={id:543,content:'Section: CRANKSHAFT\nModel: ZX200-5G\nKategori: ENGINE PARTS CATALOG\nPiston kit',metadata:{Model:'ZX200-5G',Kategori:'ENGINE PARTS CATALOG'}};
 const q={select(){return q},contains(){return q},filter(){return q},limit(){return q},then(f){return Promise.resolve({data:[row]}).then(f)}};
 const {d}=b.mockDeps([],{supabase:{from:()=>q}});
 const r=await b.runWithDeps(d,()=>b.engineSectionRows('piston','ZX200-5G'));
 t(r[0]?.id===543,'engine title pin preserves full original record');
 return done();
};
