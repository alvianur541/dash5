const { classifyAspect, fallbackDecompose, resolveMultiAspectQuery, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

module.exports = async function () {
  const { t, done } = suite('multi-aspect: classify + regex fallback');

  t(classifyAspect('travel device part number') === 'parts', 'PN → parts only');
  t(classifyAspect('travel device weight') === 'spec', 'weight → spec only');
  t(classifyAspect('swing motor seal kit price') === 'parts', 'price → parts only');
  t(classifyAspect('swing device removal installation procedure') === 'spec', 'procedure → spec only');
  t(classifyAspect('bucket pin') === 'both', 'no hint → both');

  const fb1 = fallbackDecompose('part number travel device dan beratnya');
  t(fb1.length === 2 && fb1.includes('travel device part number') && fb1.includes('travel device weight'), `PN+berat → ${JSON.stringify(fb1)}`);
  const fb2 = fallbackDecompose('berat swing motor sama diameternya');
  t(fb2.length === 2 && fb2[0] === 'swing motor weight' && fb2[1] === 'swing motor diameter', `berat+diameter → ${JSON.stringify(fb2)}`);
  t(fallbackDecompose('harga seal kit swing').length === 0, 'single attr → empty (no fallback)');
  t(fallbackDecompose('swing lambat dan pump bocor').length === 0, 'symptoms without attr → empty');

  const BATTERY = 'Section: SPECIFICATIONS - ELECTRICAL\nModel: ZX48U-5A\nBATTERY Type 115D31L-MF\nVoltage 12 V\nCapacity 72 Ah or more';
  const q = { select(){return q}, contains(){return q}, ilike(){return q}, filter(){return q}, limit(){return q}, or(){return q}, in(){return q}, then(f){return Promise.resolve({data:[{id:7704,content:BATTERY,metadata:{Model:'ZX48U-5A',Kategori:'OPERATOR MANUAL'}}],error:null}).then(f)} };
  const { d } = mockDeps([], {
    supabase:{from:()=>q,rpc:async(name,args)=>({data:name==='match_documents_keyword_ranked' && args.p_terms.some(x=>/voltage/.test(x)) ? [{id:7705,content:'Section: ELECTRICAL\nModel: ZX48U-5A\nBATTERY Voltage 12 V',metadata:{Model:'ZX48U-5A',Kategori:'OPERATOR MANUAL'}}] : [],error:null})}, embed:async()=>[.1],
    rerank:async(_q,docs)=>({results:docs.map((_,index)=>({index,score:.057})),source:'google'}),
    generate:async()=>({candidates:[{content:{parts:[{text:'["battery capacity ampere","battery voltage"]'}]}}]}),
  });
  const multi = await runWithDeps(d, () => resolveMultiAspectQuery('battery capacity dan battery voltage', [], 'ZX48U-5A'));
  t(multi.type === 'rag_found' && /Capacity 72 Ah/.test(multi.content), 'multi-aspect technical route keeps literal spec rescue');
  return done();
};
