const { test } = require('node:test');
const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { transformSync } = require('esbuild');
const moduleUnderTest = { exports: {} };
vm.runInNewContext(transformSync(readFileSync(path.join(__dirname, 'illustrationEligibility.ts'), 'utf8'), { loader: 'ts', format: 'cjs' }).code, { module: moduleUnderTest, exports: moduleUnderTest.exports });
const { shouldOfferIllustration, hasDiagram } = moduleUnderTest.exports;
const message = (role, content) => ({ id: role + content, role, content });
const offer = (question, answer) => shouldOfferIllustration([message('user', question), message('assistant', answer)], 1);

for (const [name, question, answer] of [
  ['plain identity', 'kamu pakai model ai apa', 'Saya menggunakan Gemini 3.8 Flash.'],
  ['price table', 'berapa harga filter', '| Part | Harga |\n| --- | --- |\n| Filter | Rp 500.000 |'],
  ['diagram prose mention', 'apa itu pompa', 'Lihat diagram dalam manual untuk informasi lebih lanjut.'],
  ['uploaded photo', 'gambar yang saya kirim itu apa', 'Foto monitor unit.'],
  ['diagram heading alone', 'jelaskan pompa', '## Diagram\nDiagram tersedia dalam manual.'],
  ['numeric price change', 'berapa harga', '100 --> 200'],
]) test(name + ' hides illustration', () => assert.equal(offer(question, answer), false));

for (const request of ['buat gambar', 'buatkan gambar', 'gambarkan', 'bikin diagram', 'ilustrasikan', 'draw', 'create image', 'create a diagram']) {
  test(request + ' explicitly offers illustration', () => assert.equal(offer(request + ' aliran pompa', 'Aliran dari tangki ke pompa.'), true));
}
for (const content of ['```text\n[Tangki] --> [Pompa] --> [Katup]\n```', 'Tangki → Pompa → Katup', '```mermaid\nflowchart LR\n A[Tangki] --> B[Pompa]\n```', '┌─────┐\n│Pompa│\n└──┬──┘\n   │\n   ↓\n Katup']) {
  test('actual diagram: ' + content, () => assert.equal(hasDiagram(content), true));
}
test('nearest user only: earlier drawing intent does not bleed into identity or photo turn', () => {
  for (const question of ['kamu pakai model ai apa', 'gambar yang saya kirim itu apa']) {
    const messages = [message('user', 'buat gambar pompa'), message('assistant', 'Aliran pompa.'), message('user', question), message('assistant', 'Jawaban biasa.')];
    assert.equal(shouldOfferIllustration(messages, 1), true);
    assert.equal(shouldOfferIllustration(messages, 3), false);
  }
});
test('missing preceding user and user message themselves stay hidden', () => {
  assert.equal(shouldOfferIllustration([message('assistant', 'Jawaban biasa.')], 0), false);
  assert.equal(shouldOfferIllustration([message('user', 'buat gambar')], 0), false);
});
test('ChatWindow gates the entire ImageIllustration session prop, preserving existing keyed component', () => {
  const source = readFileSync(path.join(__dirname, '../components/ChatWindow.tsx'), 'utf8');
  assert.match(source, /illustrationSessionId=\{[^\n]*shouldOfferIllustration\(messages, idx\)/);
  assert.match(source, /illustrationSessionId && !isStreaming && !isCut/);
  assert.match(source, /<ImageIllustration key=\{`\$\{illustrationSessionId\}:\$\{message.id\}`\}/);
});
test('vertical ASCII labelled nodes connected with a line and arrow are diagrams', () => {
  assert.equal(hasDiagram('```text\n[Tangki]\n   |\n   v\n[Pompa]\n```'), true);
});
