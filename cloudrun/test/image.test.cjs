const { suite } = require('./helpers.cjs');

process.env.GOOGLE_CLOUD_PROJECT ||= 'test';
process.env.SUPABASE_URL ||= 'https://test.supabase.co';
process.env.SUPABASE_ANON_KEY ||= 'test';
const { imageMagicMatches, IMAGE_MIME_ALLOWED, IMAGE_MAX_BYTES } = require('../server/config');

const b64 = bytes => Buffer.from(bytes).toString('base64');

module.exports = async function () {
  const { t, done } = suite('image: server-side validation');
  t(imageMagicMatches('image/jpeg', b64([0xFF, 0xD8, 0xFF, 0xE0, 0, 0, 0, 0])), 'real JPEG accepted');
  t(imageMagicMatches('image/png',  b64([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0, 0])), 'real PNG accepted');
  t(imageMagicMatches('image/webp', b64([0x52, 0x49, 0x46, 0x46, 4, 0, 0, 0, 0x57, 0x45, 0x42, 0x50])), 'WEBP container signature fixture accepted');
  t(!imageMagicMatches('image/jpeg', b64([0x89, 0x50, 0x4E, 0x47, 0, 0, 0, 0])), 'PNG labelled JPEG rejected');
  t(!imageMagicMatches('image/png',  b64([0x3C, 0x73, 0x76, 0x67, 0, 0, 0, 0])), 'SVG labelled PNG rejected');
  t(!imageMagicMatches('image/jpeg', b64([0x25, 0x50, 0x44, 0x46, 0, 0, 0, 0])), 'PDF labelled JPEG rejected');
  t(imageMagicMatches('image/heic', b64([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0x68, 0x65, 0x69, 0x63, 0, 0, 0, 0, 0x6d, 0x69, 0x66, 0x31, 0x68, 0x65, 0x69, 0x63])), 'HEIC ftyp brand fixture accepted');
  t(!IMAGE_MIME_ALLOWED.has('image/svg+xml') && !IMAGE_MIME_ALLOWED.has('application/pdf'), 'svg/pdf not in allowlist');
  t(IMAGE_MAX_BYTES === 8 * 1024 * 1024, 'decoded size cap 8 MB');
  return done();
};
