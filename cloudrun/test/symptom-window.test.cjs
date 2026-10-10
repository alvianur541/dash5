const b=require('./helpers.cjs');
module.exports=async()=>{
 const {t,done}=b.suite('Symptom snippet retains later symptom evidence');
 t(typeof b.symptomSnippet==='function','query-focused scoring window exists'); if(!b.symptomSnippet)return done();
 const c='Section: TROUBLESHOOTING - Engine\nModel: ZX200-5G\nKategori: TECHNICAL MANUAL\n'+'general safety boilerplate '.repeat(150)+'\nComplaint: engine speed drops during travel\nEvaluation: oil pressure low\nCause: pump load';
 const s=b.symptomSnippet(c,['engine speed drops during travel']);
 t(s.includes('engine speed drops during travel') && s.includes('Cause: pump load'),'late condition and cause participate in scoring');
 t(s.startsWith('Section:') && s.length<=1800,'title retained with bounded scoring snippet; original full evidence stays separate');
 return done();
};
