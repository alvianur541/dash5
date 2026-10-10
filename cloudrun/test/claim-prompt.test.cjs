const b=require('./helpers.cjs');
module.exports=async()=>{
 const {t,done}=b.suite('Claim-level prompt safeguards');
 for(const m of ['ZX200-5G','ZX138MF-5G','ZX48U-5A','ZX65USB-5A','ZW140','KCM 60ZV']){
 const p=b.SYSTEM_PROMPT(m);
 t(!p.includes('dealer stock') && p.includes('legend pada dokumen'),'service code source-scoped '+m);
 t(p.includes('Skor relevansi tidak membuktikan diagnosis') && !p.includes('Tanpa caveat (HIGH) → jawab tegas, tanpa hedge, tanpa reminder verifikasi.'),'retrieval confidence not diagnosis certainty '+m);
 t(p.includes('Jangan mengganti PN literal') && p.includes('komponen + atribut + nilai + satuan + kondisi'),'literal PN and exact measurement guard '+m);
 }
 return done();
};
