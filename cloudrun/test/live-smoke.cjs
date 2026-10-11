const fs = require('node:fs');
const { openProvider, inputFrame } = require('../server/live-voice');
(async () => {
 const evidence = { model: 'gemini-3.8-live', location: process.env.LIVE_LOCATION || 'us-central1', setupComplete: false, audioBytes: 0, transcript: '', paid: true };
 const chunks = [];
 const ws = await openProvider('ZX200-5G');
 const finish = () => { fs.mkdirSync('test/live-evidence', { recursive: true }); fs.writeFileSync('test/live-evidence/smoke.json', JSON.stringify(evidence, null, 2)); if(chunks.length) fs.writeFileSync('test/live-evidence/response.pcm', Buffer.concat(chunks)); console.log(JSON.stringify(evidence)); ws.terminate(); };
 const timer = setTimeout(() => { evidence.blocker = '30 second deadline'; finish(); }, 30000);
 ws.on('error', err => { evidence.blocker = err.message; });
 ws.on('close', (code, reason) => { clearTimeout(timer); evidence.closeCode = code; evidence.closeReason = reason.toString(); finish(); });
 ws.on('message', raw => {
  const r = JSON.parse(raw.toString());
  if(r.setupComplete) { evidence.setupComplete = true; ws.send(JSON.stringify(inputFrame({ type: 'text', text: 'Jawab hanya: halo.' }))); }
  evidence.transcript += r.serverContent?.outputTranscription?.text || '';
  for(const p of r.serverContent?.modelTurn?.parts || []) if(p.inlineData?.data) { const b = Buffer.from(p.inlineData.data,'base64'); evidence.audioBytes += b.length; chunks.push(b); }
  if(r.error) evidence.blocker = r.error;
  if(r.serverContent?.turnComplete) { clearTimeout(timer); finish(); }
 });
})().catch(e => { console.error(e.message); process.exitCode = 1; });
