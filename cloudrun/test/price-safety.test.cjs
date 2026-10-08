const { lengkapiHarga, resetHargaWebCache, runWithDeps, mockDeps, suite } = require('./helpers.cjs');
module.exports = async () => {
  const { t, done } = suite('price verification fails closed in Indonesian and English');
  for (const cell of ['Rp 9.999.999', 'IDR 9,999,999', '9,999,999', 'Type PN to check', 'Not available']) {
    resetHargaWebCache();
    const { d } = mockDeps([[]], { webPrice: async () => { throw new Error('offline'); } });
    const out = await runWithDeps(d, () => lengkapiHarga(`| Part Number | Name | Price |\n|---|---|---|\n| YA00020592 | VALVE | ${cell} |`));
    t(!out.includes('9.999.999') && !out.includes('9,999,999') && /Gagal dicek|Unable to verify/i.test(out), `lookup failure removes unverified ${cell}`);
  }
  resetHargaWebCache();
  const { d } = mockDeps([[]], { webPrice: async pn => [{ pn, nama: 'VALVE', harga: 'Rp 942.464' }] });
  const out = await runWithDeps(d, () => lengkapiHarga('| Part Number | Name | Price (IDR) |\n|---|---|---|\n| YA00020592 | VALVE | 9,999,999 |\n\nThe price is not available.'));
  t(out.includes('Rp 942.464') && !out.includes('9,999,999'), 'English bare numeric price verified');
  t(!out.includes('The price is not available.'), 'English contradictory price prose removed');
  const prose = await runWithDeps(d, () => lengkapiHarga('The price is IDR 9,999,999. Pressure is 3.9 MPa.'));
  t(!prose.includes('9,999,999') && prose.includes('3.9 MPa'), 'unverifiable prose currency removed without changing specs');
  return done();
};
