const { AUDIO_MAX_BYTES, AUDIO_MIME_RE, BASE64_RE, GEMINI_API_KEY, PROJECT_ID, TRANSCRIBE_MODEL } = require('./config');
const { resolveUpstream } = require('./upstream');


module.exports = function registerTranscribe(app, { verifyToken, rateLimit, bigJson }) {
  app.post('/v1/transcribe', verifyToken, rateLimit, bigJson, async (req, res) => {
    if (!PROJECT_ID) return res.status(500).json({ error: 'GOOGLE_CLOUD_PROJECT env var not set' });
    const { audio, mimeType } = req.body || {};
    if (typeof audio !== 'string' || typeof mimeType !== 'string' || !audio || !mimeType) {
      return res.status(400).json({ error: 'audio and mimeType are required' });
    }

    const cleanMimeType = mimeType.split(';')[0].trim().toLowerCase();
    if (!AUDIO_MIME_RE.test(cleanMimeType)) return res.status(415).json({ error: 'Format audio tidak didukung' });
    if (!BASE64_RE.test(audio)) return res.status(400).json({ error: 'Data audio bukan base64' });
    if (Math.floor(audio.length * 3 / 4) > AUDIO_MAX_BYTES) return res.status(413).json({ error: 'Audio terlalu besar (maks 6 MB)' });
    const t0 = Date.now();

    try {
      const isStudioTranscribe = /transcribe/.test(TRANSCRIBE_MODEL);
      let text;
      if (isStudioTranscribe) {
        if (!GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY env var not set' });
        const bytes = Buffer.from(audio, 'base64');
        const startRes = await fetch(
          `https://generativelanguage.googleapis.com/upload/v1beta/files?key=${GEMINI_API_KEY}`,
          { method: 'POST',
            headers: {
              'X-Goog-Upload-Protocol': 'resumable',
              'X-Goog-Upload-Command': 'start',
              'X-Goog-Upload-Header-Content-Length': String(bytes.length),
              'X-Goog-Upload-Header-Content-Type': cleanMimeType,
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({ file: { display_name: 'dash5-audio' } }),
          });
        const uploadUrl = startRes.headers.get('x-goog-upload-url');
        if (!uploadUrl) { console.error('Transcribe: no upload URL', startRes.status); return res.status(502).json({ error: 'Transcribe gagal (upload init).' }); }
        const upRes = await fetch(uploadUrl, {
          method: 'POST',
          headers: { 'Content-Length': String(bytes.length), 'X-Goog-Upload-Offset': '0', 'X-Goog-Upload-Command': 'upload, finalize' },
          body: bytes,
        });
        const upJson = await upRes.json();
        const fileUri = upJson?.file?.uri;
        if (!fileUri) { console.error('Transcribe: no file URI', JSON.stringify(upJson)); return res.status(502).json({ error: 'Transcribe gagal (upload).' }); }
        const vocab = (process.env.TRANSCRIBE_VOCAB || '').split(',').map(v => v.trim()).filter(Boolean);
        const interBody = {
          model: TRANSCRIBE_MODEL,
          input: [{ type: 'audio', uri: fileUri, mime_type: cleanMimeType }],
          ...(vocab.length ? { generation_config: { transcription_config: { custom_vocabulary: vocab.slice(0, 1000) } } } : {}),
        };
        const inter = await fetch('https://generativelanguage.googleapis.com/v1beta/interactions', {
          method: 'POST',
          headers: { 'x-goog-api-key': GEMINI_API_KEY, 'Content-Type': 'application/json' },
          body: JSON.stringify(interBody),
        });
        if (!inter.ok) { const e = await inter.json().catch(() => ({})); console.error('Transcribe error:', JSON.stringify(e)); return res.status(502).json({ error: 'Transcribe gagal. Coba lagi.' }); }
        const data = await inter.json();
        text = (data.output_text || '').trim();
        if (!text && Array.isArray(data.steps)) {
          text = data.steps
            .filter(st => st.type === 'model_output')
            .flatMap(st => (st.content || []))
            .filter(c => c.type === 'text' && c.text)
            .map(c => c.text).join('').trim();
        }
      } else {
        const { url, headers } = await resolveUpstream(TRANSCRIBE_MODEL, { stream: false });
        const upstream = await fetch(url, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            contents: [{
              role: 'user',
              parts: [
                { inline_data: { mime_type: cleanMimeType, data: audio } },
                { text: 'Transcribe this audio accurately. Use the same language as spoken. Return only the transcribed text, no explanations or punctuation notes.' },
              ],
            }],
            generationConfig: {
              maxOutputTokens: 1024,
              ...(TRANSCRIBE_MODEL.startsWith('gemini-3') ? { thinkingConfig: { thinkingLevel: 'low' } } : {}),
            },
          }),
        });
        if (!upstream.ok) {
          const err = await upstream.json().catch(() => ({}));
          console.error('Transcribe error:', JSON.stringify(err));
          return res.status(502).json({ error: 'Transcribe gagal. Coba lagi.' });
        }
        const data = await upstream.json();
        const parts = data.candidates?.[0]?.content?.parts ?? [];
        text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
      }
      console.info('[transcribe] model=%s ms=%d chars=%d', TRANSCRIBE_MODEL, Date.now() - t0, text.length);
      return res.json({ text });
    } catch (err) {
      console.error('Transcribe error:', err);
      return res.status(500).json({ error: 'Transcribe gagal. Coba lagi.' });
    }
  });
};
