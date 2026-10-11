const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL = /^[^\s@,*]+@[^\s@,*]+\.[^\s@,*]+$/;

function usageIdentity(user, configured = process.env.INTERNAL_USERS || '') {
  const id = user && typeof user.id === 'string' && UUID.test(user.id) ? user.id.toLowerCase() : null;
  const email = user && typeof user.email === 'string' ? user.email.toLowerCase() : '';
  const tokens = configured.split(',').map(x => x.trim().toLowerCase()).filter(Boolean);
  const valid = tokens.every(x => UUID.test(x) || EMAIL.test(x));
  return { user_id: id, is_internal: !!id && valid && tokens.some(x => x === id || (EMAIL.test(x) && x === email)) };
}

module.exports = { usageIdentity };
