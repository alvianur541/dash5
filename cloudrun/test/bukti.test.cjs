// Evidence, provenance, grounding and telemetry regressions. Each block was its own file; kept verbatim in its own scope.
const blok = [
  // claim-grounding
  (module => {
    const b=require('./helpers.cjs');
    module.exports=async()=>{
     const {t,done}=b.suite('Exact claim grounding');
     t(typeof b.groundClaim==='function','claim-scoped checker exists'); if(!b.groundClaim)return done();
     const docs=[{document_id:1,model:'ZX48U-5A',source:'BROSUR MANUAL',section:'Hydraulic',document:null,evidence_role:'numeric',content:'Boom cylinder bore: 90 mm\nArm cylinder bore: 80 mm\nEngine oil refill: 8.6 L\nEngine oil change: 7.4 L'}];
     const c={component:'Boom cylinder',attribute:'bore',value:'90',unit:'mm',model:'ZX48U-5A',document_id:1};
     t(b.groundClaim(c,docs).status==='supported','same component attribute value unit source supported');
     t(b.groundClaim({...c,component:'Arm cylinder'},docs).status!=='supported','number elsewhere cannot support wrong component');
     t(b.groundClaim({...c,unit:'MPa'},docs).status!=='supported','unit cannot be borrowed');
     t(b.groundClaim({...c,model:'ZX200-5G'},docs).status!=='supported','model isolation');
     t(b.groundClaim({...c,document_id:2},docs).status!=='supported','citation must refer to real source');
     t(b.groundClaim({component:'Engine oil',attribute:'refill',value:'7.4',unit:'L',model:'ZX48U-5A',document_id:1},docs).status!=='supported','condition-specific capacity cannot be swapped');
     return done();
    };
    return module.exports;
  })({ exports: null }),
  // claim-prompt
  (module => {
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
    return module.exports;
  })({ exports: null }),
  // confidence-provenance
  (module => {
    const b = require('./helpers.cjs');
    const rows = [{ id:9590, content:'Section: CYLINDER LIFT ARM\nModel: ZW140\nKategori: PARTS CATALOG\n01 | 263E8-47231 | SEAL KIT | qty:1', metadata:{Model:'ZW140',Kategori:'PARTS CATALOG'}, similarity:.8 }];
    const db = () => { const q={ select(){return q},contains(){return q},ilike(){return q},filter(){return q},limit(){return q},or(){return q},then(f){return Promise.resolve({data:rows,error:null}).then(f)} }; return {from:()=>q,rpc:async()=>({data:rows,error:null})}; };
    module.exports = async () => {
     const {t,done}=b.suite('Confidence provenance (offline providers)');
     const {d}=b.mockDeps([], {supabase:db(),embed:async()=>[.1],rerank:async(_q,docs)=>({results:docs.map((_,index)=>({index,score:.2})),source:'google'}),generate:async()=>({candidates:[{content:{parts:[{text:'["lift cylinder part number", "lift cylinder seal kit price"]'}]}}]})});
     const r=await b.runWithDeps(d,()=>b.resolvePartsQuery('part number lift cylinder',[],'ZW140',undefined,'lift cylinder part number',false));
     t(r.confidence==='medium' && r.evidence?.[0]?.document_id===9590,'parts preserve confidence and actual document id');
     const m=await b.runWithDeps(d,()=>b.resolveMultiAspectQuery('part number lift cylinder dan seal kit',[],'ZW140'));
     t(m.aspectConfidence?.length===2 && m.aspectConfidence.every(a=>a.status==='found'),'shared evidence supports both aspects, not a false missing after dedupe');
     t(m.confidence && m.evidence?.length>0,'multi-aspect preserves confidence and document boundaries');
     return done();
    };
    return module.exports;
  })({ exports: null }),
  // engine-provenance
  (module => {
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
    return module.exports;
  })({ exports: null }),
  // evidence-boundaries
  (module => {
    const { rankAndSelect, runWithDeps, mockDeps, suite } = require('./helpers.cjs');
    module.exports = async () => {
      const { t, done } = suite('Structured evidence (offline provider fixture)');
      const doc = 'Section: Diagnosing Procedure\nModel: ZX138MF-5G\nKategori: TECHNICAL MANUAL\nDocument: Manual\nsource a\n\n---\n\nload b';
      const { d } = mockDeps([], { rerank: async () => ({ results: [{ index: 0, score: .2 }], source: 'google' }) });
      const r = await runWithDeps(d, () => rankAndSelect('terminal a b', [doc], [], false, false, 4, 0));
      t(r.evidence?.length === 1 && r.evidence[0].content === doc, 'internal Markdown divider does not make another document');
      t(r.evidence?.[0]?.section === 'Diagnosing Procedure' && r.evidence[0].source === 'TECHNICAL MANUAL', 'provenance survives ranking');
      t(r.evidence?.[0]?.evidence_role === 'procedure', 'true procedure has an explicit protected evidence role');
      t(r.rerankSource === 'google', 'provider source survives result');
      return done();
    };
    return module.exports;
  })({ exports: null }),
  // keyword-provenance
  (module => {
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
    return module.exports;
  })({ exports: null }),
  // minority-evidence
  (module => {
    const b=require('./helpers.cjs');
    module.exports=async()=>{
     const {t,done}=b.suite('Unknown minority evidence is never discarded');const {d}=b.mockDeps([]);
     await b.runWithDeps(d,async()=>{b.registerEvidence([{id:2045,content:'registered manual'}]);const docs=b.evidenceBlocks('registered manual\n\n---\n\nminority pump weight 310 kg');t(docs.some(d=>d.content.includes('minority pump weight 310 kg')),'partial provenance match must not remove unregistered source content');t(docs.length===1 && docs[0].document_id===null,'cannot invent source boundary or id for partially known legacy context')});
     return done();
    };
    return module.exports;
  })({ exports: null }),
  // numeric-pin
  (module => {
    const b=require('./helpers.cjs');
    module.exports=async()=>{
     const {t,done}=b.suite('Numeric pin score provenance');
     const first='Section: Pump\nPump pressure: 3.9 MPa';
     const minority='Section: Pump specs\nPump weight: 310 kg';
     const {d}=b.mockDeps([], {rerank:async()=>({source:'google',results:[{index:0,score:.8}]})});
     const r=await b.runWithDeps(d,()=>b.rankAndSelect('pump weight',[first,minority],[minority],true,false,4,0));
     const e=r.evidence?.find(e=>e.content===minority);
     t(e?.score===0 && !e.score_source && e.evidence_role==='numeric','unscored keyword pin never borrows top-1 score or provider');
     t(r.confidence==='medium','answer-critical unscored numeric pin prevents a false high-confidence result');
     return done();
    };
    return module.exports;
  })({ exports: null }),
  // provenance-downgrade
  (module => {
    const b=require('./helpers.cjs');
    module.exports=async()=>{
     const {t,done}=b.suite('No provenance laundering or downgrade');const {d}=b.mockDeps([]);
     await b.runWithDeps(d,async()=>{b.registerEvidence([{id:2045,content:'literal manual',metadata:{Model:'ZX138MF-5G'}}]);b.registerEvidence([{content:'literal manual'}]);t(b.evidenceFor('literal manual').document_id===2045,'keyword RPC without id cannot erase a known source id')});
     return done();
    };
    return module.exports;
  })({ exports: null }),
  // selection-telemetry
  (module => {
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
    return module.exports;
  })({ exports: null }),
  // stage-telemetry
  (module => {
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
    return module.exports;
  })({ exports: null }),
  // symptom-integrity
  (module => {
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
    return module.exports;
  })({ exports: null }),
  // symptom-window
  (module => {
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
    return module.exports;
  })({ exports: null }),
  // resolved-rerank
  (module => {
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
    return module.exports;
  })({ exports: null }),
  // resolved-question
  (module => {
    const b = require('./helpers.cjs');
    module.exports = async () => {
      const { t, done } = b.suite('Immutable resolved question');
      t(typeof b.resolveQuestion === 'function', 'one request contract exists');
      if (!b.resolveQuestion) return done();
      const h = [{ role:'user', content:'Fuse No.4 terminal b short' }, { role:'assistant', content:'Standar 999 Ω, semua a satu busbar.' }];
      const r = b.resolveQuestion('kabel power d diputus, tidak short, hasil ukur 49 Ω',h,'ZX138MF-5G');
      t(r.text.includes('Fuse No.4') && r.text.includes('tidak short') && r.measurements.includes('49 Ω'), 'topic, new condition, literal measurement preserved');
      t(!r.text.includes('999') && !r.text.includes('busbar'), 'previous AI facts are never evidence');
      t(Object.isFrozen(r) && Object.isFrozen(r.userContext) && r.raw === 'kabel power d diputus, tidak short, hasil ukur 49 Ω', 'deep-frozen user literals');
      const fresh = b.resolveQuestion('berapa berat travel device',h,'ZX200-5G');
      t(fresh.userContext.length === 0 && !fresh.text.includes('Fuse'), 'new explicit component does not inherit old question');
      const newTopic = b.resolveQuestion('berapa berat travel device yang itu', h, 'ZX200-5G');
      t(!newTopic.text.includes('Fuse'), 'explicit new component does not inherit old fault even with colloquial pointer');
      const faultHistory = [{ role:'user', content:'kode 11006-2 artinya apa' }, { role:'assistant', content:'...' }];
      const battery = b.resolveQuestion('Kalau akinya ini pakai yang berapa ampere?', faultHistory, 'ZX200-5G');
      t(!battery.text.includes('11006-2') && /aki/i.test(battery.component ?? ''), 'explicit battery question does not inherit old fault code');
      const weightHistory = [{ role:'user', content:'travel device' }, { role:'assistant', content:'Bagian mana yang ingin dicek?' }];
      const weight = b.resolveQuestion('berapa beratnya', weightHistory, 'ZX200-5G');
      t(/travel device/i.test(weight.text) && /travel device/i.test(weight.component ?? ''), 'suffix -nya follow-up inherits prior component');
      return done();
    };
    return module.exports;
  })({ exports: null }),
  // selective-compression
  (module => {
    const b = require('./helpers.cjs');
    module.exports = async () => {
      const { t, done } = b.suite('Selective compression (offline generation fixture)');
      t(typeof b.compressEvidence === 'function', 'bounded per-document compressor exists');
      if (!b.compressEvidence) return done();
      let calls = 0;
      const { d } = b.mockDeps([], { generate: async () => { calls++; return { candidates: [{ content: { parts: [{ text: 'invented pressure 999 MPa' }] } }] }; } });
      const mk = (content, role = 'retrieved') => ({ document_id: 1, source: 'MANUAL', section: 'Test', document: null, model: 'ZX138MF-5G', content, evidence_role: role });
      const short = [mk('source a\n\n---\n\nload b'.repeat(500))];
      const a = await b.runWithDeps(d, () => b.compressEvidence(short, 'terminal b'));
      t(calls === 0 && a[0].content === short[0].content, 'complete modest evidence skips generation');
      t(d.meta.stages?.at(-1)?.stage === 'compression' && d.meta.stages.at(-1).calls === 0, 'skipped compression logs zero calls and real bytes');
      const procedure = mk(('Procedure Inspection Method Condition Evaluation Cause\ncheck wiring\n').repeat(400));
      const c = await b.runWithDeps(d, () => b.compressEvidence([procedure], 'terminal b'));
      t(calls === 0 && c[0].content === procedure.content, 'long procedure keeps every condition and cause');
      const long = Array.from({ length: 6 }, (_, i) => ({ ...mk(('unrelated text '+i+'\n').repeat(700)), document_id: i }));
      const out = await b.runWithDeps(d, () => b.compressEvidence(long, 'terminal b'));
      t(calls <= 2 && out.every((r,i) => r.content === long[i].content), 'at most two extracts; fabricated excerpt falls back without cutting');
      return done();
    };
    return module.exports;
  })({ exports: null }),
  // log-privacy
  (module => {
    const { ringkasTanya } = require('../server/observability');
    const { suite } = require('./helpers.cjs');
    module.exports = async () => {
      const { t, done } = suite('request log privacy');
      const personal = 'fixture private identity and private question';
      const summary = ringkasTanya(personal, 1);
      t(!summary.includes('private') && summary.includes(String(personal.length)), 'question summary records length, never question contents');
      t(summary.includes('[+foto]'), 'photo marker remains available for diagnostics');
      return done();
    };
    return module.exports;
  })({ exports: null }),
];

module.exports = async () => {
  let ok = true;
  for (const s of blok) ok = (await s()) && ok;
  return ok;
};
