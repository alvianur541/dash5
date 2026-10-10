const path=require('node:path');
const root=process.argv[2]||__dirname;
(async()=>{
 const files=['evidence-boundaries','confidence-provenance','claim-prompt','symptom-integrity','numeric-pin','keyword-provenance','engine-provenance'];
 const result=[];for(const name of files){try{result.push({suite:name,passed:await require(path.join(root,name+'.test.cjs'))()})}catch(e){result.push({suite:name,passed:false,error_type:e.constructor.name})}}
 console.log('DIFFERENTIAL_RESULT '+JSON.stringify({scope:'same offline regression fixtures, not generated-answer benchmark',passed:result.filter(r=>r.passed).length,total:result.length,result}));
})();
