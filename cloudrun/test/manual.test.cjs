const { searchTechnicalManualMulti, runWithDeps, mockDeps, suite } = require('./helpers.cjs');

function emptySupabase() {
  const q = {
    select() { return q; }, or() { return q; }, contains() { return q; }, ilike() { return q; }, limit() { return q; },
    then(resolve) { return Promise.resolve({ data: [], error: null }).then(resolve); },
  };
  return { from: () => q, rpc: () => Promise.resolve({ data: [], error: null }) };
}

module.exports = async function () {
  const { t, done } = suite('manual search: a failed search is not "not in the manual"');

  { const { d } = mockDeps([[]], { supabase: emptySupabase(), embed: async () => { throw new Error('embed down'); } });
    const r = await runWithDeps(d, () => searchTechnicalManualMulti(['swing motor weight'], 'ZX200-5G'));
    t(!r.hasResults && /embed down/.test(r.ragError ?? ''), 'embedding failed and nothing found → ragError, not a silent miss'); }

  { const { d } = mockDeps([[]], { supabase: emptySupabase(), embed: async () => [0.1, 0.2] });
    const r = await runWithDeps(d, () => searchTechnicalManualMulti(['boom cylinder weight'], 'ZX200-5G'));
    t(!r.hasResults && !r.ragError, 'healthy search with no hits → plain miss'); }

  return done();
};
