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
