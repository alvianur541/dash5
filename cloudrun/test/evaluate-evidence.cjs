const fs=require('node:fs');
const crypto=require('node:crypto');
const b=require('./helpers.cjs');
const gold=require('./fixtures/prompt-rerank-gold.json');
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>i%2===0?[...a,[v.replace(/^--/,''),all[i+1]]]:a,[]));
(async()=>{
 const sources=JSON.parse(fs.readFileSync(args.sources,'utf8'));
 const by=new Map(sources.map(d=>[d.id,d]));
 const verifications=gold.cases.map(c=>({id:c.id,label:c.label,verified:c.evidence.length>0&&c.evidence.every(e=>by.get(e.document_id)?.content.includes(e.quote))}));
 if(verifications.some((v,i)=>['supported','contradicted'].includes(gold.cases[i].label)&&!v.verified))throw Error('source mismatch');
 for(const [id,hash] of Object.entries(gold.source_sha256))if(crypto.createHash('sha256').update(by.get(Number(id)).content).digest('hex')!==hash)throw Error('changed snapshot');
 const compression=[];
 for(const ids of [[2044],[2045],[2136],[1891],[2044,2045],[2044,2045,2136,1891]]){
   const docs=ids.map(id=>({...by.get(id),document_id:id,evidence_role:'retrieved'}));
   const callsBefore=docs.flatMap(d=>d.content.split('\n\n---\n\n')).filter(c=>c.length>=500).length;
   let calls=0; const {d}=b.mockDeps([],{generate:async()=>{calls++;throw Error('offline extraction fixture unavailable')}});
   const after=await b.runWithDeps(d,()=>b.compressEvidence(docs,'Fuse No.4 terminal b isolasi short'));
   compression.push({ids,input_chars:docs.reduce((n,d)=>n+d.content.length,0),before_separator_calls:callsBefore,after_actual_fixture_calls:calls,complete_document_recall:after.filter((a,i)=>a.content===docs[i].content).length/docs.length,rough_context_tokens:Math.ceil(docs.reduce((n,d)=>n+d.content.length,0)/4),tokens_note:'chars/4 planning estimate, not measured Gemini token count'});
 }
 const ablation=[];
 if(args.benchmark){
   const online=JSON.parse(fs.readFileSync(args.benchmark,'utf8'));
   for(const cand of online.candidates)for(const call of online.calls.filter(c=>c.family===cand.family&&c.outcome==='ok'))for(const cap of [20,30])for(const final of [4,6,7])for(const lambda of [.7,.85,1]){
     const pool=call.results.filter(r=>r.index<cap).slice(0,10).map(r=>({content:cand.documents[r.index].content,score:r.score,id:r.document_id}));
     const selected=b.mmrSelect(pool,final,lambda);
     const rank=selected.findIndex(r=>cand.positive_ids.includes(r.id));
     ablation.push({family:cand.family,provider:call.provider,cap,final,lambda,known_positive_recall:selected.filter(r=>cand.positive_ids.includes(r.id)).length/cand.positive_ids.length,reciprocal_rank:rank>=0?1/(rank+1):0,section_count:new Set(selected.map(r=>r.content.split('\n')[0])).size});
   }
 }
 const latency={};if(args.benchmark){const online=JSON.parse(fs.readFileSync(args.benchmark,'utf8'));for(const provider of ['google','cohere']){const values=online.calls.filter(c=>c.provider===provider&&c.outcome==='ok').map(c=>c.wall_ms).sort((a,b)=>a-b);const p=q=>{const i=(values.length-1)*q,j=Math.floor(i);return values[j]+(values[Math.ceil(i)]-values[j])*(i-j)};latency[provider]={n:values.length,p50_ms:p(.5),p90_ms:p(.9),p95_ms:p(.95),cost_usd:null}}}
 const out={evaluation_scope:'source excerpts, actual compression code with offline generator fixture, stored REAL paid provider scores; no generated-answer accuracy',gold:{cases:gold.cases.length,labels:gold.labels,source_verified_claims:verifications.filter(v=>v.verified).length,photo_missing_input:7,human_new_adjudication:false},verifications,compression,ablation,online_latency:latency,decisions:{thresholds:'unchanged',providers:'Google primary / Cohere fallback unchanged',mmr:'0.7 unchanged; small source-positive ablation not sufficient calibrated holdout',rerank_window:'8k retained pending paid window ablation; offline inspect outliers, no index remapping deployed',kcm:'no new symptom-title regex: inspected actual sources only generic flowchart and forewords',rechunk:'deferred, no gold proof for DB migration'},unmeasured:['answer fidelity percentage','end-to-end TTFT/total improvement','independent human routing accuracy','billing cost','actual Gemini token count','production warm/cold']};
 fs.writeFileSync(args.out,JSON.stringify(out,null,2)+'\n'); console.log(JSON.stringify({gold:out.gold,compression,online_latency:latency,ablation_rows:ablation.length}));
})().catch(e=>{console.error(e.message);process.exit(1)});
