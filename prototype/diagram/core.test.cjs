const {test} = require('node:test');
const assert = require('node:assert/strict');
const core = require('./core.cjs');
const graph = () => ({title:'Lamp check', nodes:[{id:'a',label:'Start',type:'start'},{id:'b',label:'Check',type:'decision'},{id:'c',label:'Done',type:'end'}],edges:[{from:'a',to:'b',label:''},{from:'b',to:'c',label:'Yes'}],sources:[]});
test('accepts valid graph without claiming sources', () => assert.equal(core.validate(graph()).nodes.length,3));
for (const [name,change] of [
 ['missing node',g=>g.edges[0].to='missing'], ['duplicate IDs',g=>g.nodes[1].id='a'],
 ['unsupported shape',g=>g.nodes[1].type='html'], ['node limit',g=>g.nodes=Array(41).fill(g.nodes[0])],
 ['invented source',g=>g.sources=['manual-999']], ['label cap',g=>g.nodes[0].label='x'.repeat(161)]
]) test('rejects '+name,()=>{const g=graph();change(g);assert.throws(()=>core.validate(g));});
test('source whitelist is separate from structural validation',()=>{const g=graph();g.sources=['read-1'];assert.equal(core.validate(g,['read-1']).sources[0],'read-1');});
test('branch and cycle layout deterministic, no node overlap, orthogonal paths',()=>{
 const g=graph();g.edges.push({from:'b',to:'a',label:'No'},{from:'b',to:'b',label:'Retry'});
 const a=core.layout(g);assert.deepEqual(a,core.layout(g));
 for(let i=0;i<a.nodes.length;i++)for(let j=i+1;j<a.nodes.length;j++)assert.ok(a.nodes[i].y+100<a.nodes[j].y || a.nodes[j].y+100<a.nodes[i].y);
 for(const edge of a.edges)for(let i=1;i<edge.points.length;i++)assert.ok(edge.points[i][0]===edge.points[i-1][0]||edge.points[i][1]===edge.points[i-1][1]);
});
test('SVG escapes executable markup including title and edge labels',()=>{
 const g=graph();g.title='<script>alert(1)</script>';g.nodes[0].label='<img src=x onerror=alert(1)>';g.edges[0].label='<script>';
 const svg=core.render(g);assert.ok(!svg.includes('<script>'));assert.ok(!svg.includes('<img'));assert.ok(svg.includes('&lt;img'));
});
