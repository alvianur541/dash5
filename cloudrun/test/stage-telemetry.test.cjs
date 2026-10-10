const b=require('./helpers.cjs');
module.exports=async()=>{
 const {t,done}=b.suite('Privacy-safe overlapping stage telemetry');
 t(typeof b.stage==='function','structured stage recorder exists'); if(!b.stage)return done();
 const {d}=b.mockDeps([], {requestId:'fixture-rid'});
 await b.runWithDeps(d,()=>Promise.all([b.stage('db_search',async()=>{await new Promise(r=>setTimeout(r,15))}),b.stage('rerank',async()=>{await new Promise(r=>setTimeout(r,15))},{provider:'google'})]));
 const es=d.meta.stages;
 t(es?.length===2 && es.every(e=>e.rid==='fixture-rid' && e.wall_ms>=0 && e.start_ms>=0),'request id and monotonic wall clocks');
 t(Math.abs(es[0].start_ms-es[1].start_ms)<10,'parallel work is represented as overlapping spans, not summed latency');
 t(!JSON.stringify(es).includes('contents') && es.every(e=>!e.query),'no chat contents in stage data');
 try{await b.runWithDeps(d,()=>b.stage('embed',async()=>{throw Error('private chat content')}))}catch{}
 t(d.meta.stages.at(-1).outcome==='error' && !JSON.stringify(d.meta.stages).includes('private chat'),'failure status without error message leakage');
 return done();
};
