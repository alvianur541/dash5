const b=require('./helpers.cjs');
module.exports=async()=>{
 const {t,done}=b.suite('Resolved question reaches scoring unchanged');
 let query;
 const resolvedQuestion=b.resolveQuestion('kabel power d diputus, tidak short, hasil ukur 49 Ω',[{role:'user',content:'Fuse No.4 terminal b short'}],'ZX138MF-5G');
 const {d}=b.mockDeps([],{resolvedQuestion,rerank:async q=>{query=q;return {source:'google',results:[{index:0,score:.2}]}}});
 await b.runWithDeps(d,()=>b.rerankDocs('fuse electrical troubleshooting',['manual'],1));
 t(query.includes(resolvedQuestion.text),'scoring preserves reported measurement, condition and literal raw input');
 return done();
};
