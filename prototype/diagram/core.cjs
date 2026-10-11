(function(root) {
  const fail = message => { throw new Error(message); };
  const text = (v, max) => typeof v === 'string' && v.length <= max && !/[\u0000-\u001f]/.test(v);
  function validate(g, retrievedIds = []) {
    if (!g || JSON.stringify(g).length > 40000) fail('Diagram exceeds 40 KB');
    if (!text(g.title,120) || !Array.isArray(g.nodes) || !g.nodes.length || g.nodes.length > 40 || !Array.isArray(g.edges) || g.edges.length > 80 || !Array.isArray(g.sources)) fail('Invalid diagram structure or limits');
    const ids = new Set();
    for (const n of g.nodes) {
      if (!n || !/^[a-zA-Z][a-zA-Z0-9_-]{0,31}$/.test(n.id) || ids.has(n.id) || !text(n.label,160) || !n.label.trim() || !['start','process','decision','end'].includes(n.type)) fail('Invalid or duplicate node');
      ids.add(n.id);
    }
    for (const e of g.edges) if (!e || !ids.has(e.from) || !ids.has(e.to) || !text(e.label,40)) fail('Invalid edge endpoint or label');
    if (g.sources.length > 20 || g.sources.some(id => typeof id !== 'string' || !retrievedIds.includes(id))) fail('Source not in retrieved document IDs');
    return {title:g.title,nodes:g.nodes.map(({id,label,type})=>({id,label,type})),edges:g.edges.map(({from,to,label})=>({from,to,label})),sources:[...new Set(g.sources)]};
  }
  function layout(input, retrievedIds = []) {
    const g=validate(input,retrievedIds), seen=new Set(), ordered=[];
    const queue=g.nodes.filter(n=>n.type==='start').map(n=>n.id);
    for(const seed of [...queue,...g.nodes.map(n=>n.id)]) {
      const pending=[seed];
      while(pending.length) {
        const id=pending.shift(); if(seen.has(id))continue; seen.add(id);
        ordered.push(g.nodes.find(n=>n.id===id));
        pending.push(...g.edges.filter(e=>e.from===id).map(e=>e.to));
      }
    }
    const nodes=ordered.map((n,i)=>({...n,x:40,y:80+i*150})), positions=new Map(nodes.map(n=>[n.id,n]));
    let lanes=0;
    const edges=g.edges.map(e=>{
      const a=positions.get(e.from),b=positions.get(e.to);
      if(b.y===a.y+150 && g.edges.filter(v=>v.from===e.from).length===1) return {...e,points:[[170,a.y+100],[170,b.y]],labelX:180,labelY:a.y+125};
      const lane=370+lanes++*100;
      return {...e,points:[[300,a.y+50],[lane,a.y+50],[lane,b.y+110],[170,b.y+110],[170,b.y+100]],labelX:lane+5,labelY:a.y+40};
    });
    return {...g,nodes,edges,width:Math.max(360,370+lanes*100),height:110+nodes.length*150};
  }
  const escape = value => String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&apos;'}[c]));
  function render(input, retrievedIds = []) {
    const g=layout(input,retrievedIds);
    const edges=g.edges.map(e=>`<polyline points="${e.points.map(p=>p.join(',')).join(' ')}" fill="none" stroke="#526170" stroke-width="2" marker-end="url(#arrow)"/><text x="${e.labelX}" y="${e.labelY}" font-size="12" fill="#273340">${escape(e.label)}</text>`).join('');
    const nodes=g.nodes.map(n=>{
      const shape=n.type==='decision'?`<polygon points="${n.x+130},${n.y} ${n.x+260},${n.y+50} ${n.x+130},${n.y+100} ${n.x},${n.y+50}"/>`:`<rect x="${n.x}" y="${n.y}" width="260" height="100" rx="${['start','end'].includes(n.type)?45:8}"/>`;
      const lines=n.label.match(/.{1,26}(?:\s|$)|.{1,26}/g)||[''];
      return `<g fill="${n.type==='decision'?'#fff0dc':'#f3f6f8'}" stroke="#293440" stroke-width="2">${shape}</g><text text-anchor="middle" font-size="13" fill="#17212b">${lines.map((line,i)=>`<tspan x="170" y="${n.y+50-(lines.length-1)*8+i*16}">${escape(line.trim())}</tspan>`).join('')}</text>`;
    }).join('');
    return `<svg xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${escape(g.title)}" viewBox="0 0 ${g.width} ${g.height}" width="${g.width}" height="${g.height}" font-family="Arial,sans-serif"><title>${escape(g.title)}</title><rect width="100%" height="100%" fill="white"/><defs><marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#526170"/></marker></defs><text x="40" y="35" font-size="18" fill="#17212b">${escape(g.title)}</text>${edges}${nodes}<text x="40" y="${g.height-15}" font-size="12" fill="#526170">Illustrative troubleshooting flow — not an official schematic</text></svg>`;
  }
  const api = {validate,layout,render};
  if (typeof module !== 'undefined') module.exports = api; else root.Diagram = api;
})(globalThis);
