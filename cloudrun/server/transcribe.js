const { AUDIO_MAX_BYTES, AUDIO_MIME_RE, BASE64_RE, PROJECT_ID, TRANSCRIBE_MODEL } = require('./config');
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
      const text = parts.filter(p => p.text && !p.thought).map(p => p.text).join('').trim();
      console.info('[transcribe] model=%s ms=%d chars=%d', TRANSCRIBE_MODEL, Date.now() - t0, text.length);
      return res.json({ text });
    } catch (err) {
      console.error('Transcribe error:', err);
      return res.status(500).json({ error: 'Transcribe gagal. Coba lagi.' });
    }
  });
};
