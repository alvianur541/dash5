const assert = require('node:assert/strict');
module.exports = async () => {
  const config = require('../server/config');
  const saved = {...config};
  const modulePath = require.resolve('../server/observability');
  const cached = require.cache[modulePath];
  const fetchBefore = global.fetch;
  const requests = [];
  const id = '11111111-1111-4111-8111-111111111111';
  try {
    Object.assign(config,{SUPABASE_URL:'https://fixture.example.test',SUPABASE_ANON_KEY:'fixture',USAGE_LOG_ON:true});
    delete require.cache[modulePath];
    const { catatPemakaian } = require('../server/observability');
    global.fetch = async (_url,options) => {
      requests.push(JSON.parse(options.body));
      return requests.length===1 ? new Response(JSON.stringify({code:'PGRST204',message:"Could not find the 'ttft_ms' column"}),{status:400}) : new Response(null,{status:201});
    };
    const req={authUser:{id,email:'fixture@example.test'},authToken:'fixture'};
    const d={usage:{input:0,output:0,calls:0},meta:{},biaya:0};
    await catatPemakaian(req,d);
    assert.equal(requests.length,2);
    assert.equal(requests[1].user_id,id,'latency fallback must preserve identity when present');
    assert.equal('ttft_ms' in requests[1],false);
    delete require.cache[modulePath];
    const logger=require('../server/observability');
    requests.length=0;
    global.fetch=async (_url,options)=>{
      requests.push(JSON.parse(options.body));
      return requests.length===1 ? new Response(JSON.stringify({code:'PGRST204',message:"Could not find the 'user_id' column"}),{status:400}) : new Response(null,{status:201});
    };
    await logger.catatPemakaian(req,d);
    assert.equal(requests.length,2);
    assert.equal('user_id' in requests[1],false);
    assert.equal('ttft_ms' in requests[1],true,'identity fallback retains latency fields');
    console.log('usage transport: independent identity/latency schema fallback passed');
    return true;
  } catch(e){console.error(e);return false;}
  finally {Object.assign(config,saved);global.fetch=fetchBefore;if(cached) require.cache[modulePath]=cached;else delete require.cache[modulePath];}
};
