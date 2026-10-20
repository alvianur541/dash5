import { useEffect } from 'react';
import { AnswerPresentation } from '../components/AnswerPresentation';
import Markdown from '../components/Markdown';
import { validateAnswerPresentation } from '../lib/presentation';
import type { AnswerPresentationV1 } from '../types';

const specMarkdown = `### Main relief pressure\n\nMain relief pressure adalah **34 MPa** untuk unit ZX200-5G. Kondisi pengukuran: hydraulic oil pada operating temperature.\n\nSumber: Workshop Manual — Hydraulic System.`;
const newsMarkdown = `### Technical News\n\nTechnical News **06/TSD-CE/TN/9/2023** menjelaskan perubahan Main & Floor Harness untuk ZX48U-5A.\n\nSumber: Technical News — Main & Floor Harness per Nomor Seri.`;

const spec: AnswerPresentationV1 = {
  version: 1,
  blocks: [
    {
      type: 'spec_value', label: 'Main relief pressure', value: '34', unit: 'MPa', unitModel: 'ZX200-5G',
      alternateValues: [{ value: '346.7', unit: 'kgf/cm²' }],
      facts: [
        { label: 'Condition', value: 'Hydraulic oil at operating temperature' },
        { label: 'Measurement point', value: 'Main pump delivery pressure port' },
      ],
      sources: [{ documentId: '10580', title: 'ZX200-5G Workshop Manual', category: 'MANUAL', section: 'Hydraulic System — Performance Standard', revision: 'Revision 2025-04' }],
    },
    { type: 'markdown', content: specMarkdown },
  ],
};

const news: AnswerPresentationV1 = {
  version: 1,
  blocks: [
    {
      type: 'technical_news', bulletinId: '06/TSD-CE/TN/9/2023', date: '2023-09-06', title: 'Main & Floor Harness per Nomor Seri / Serial Number Applicability',
      affectedModels: ['ZX48U-5A'],
      sources: [{ documentId: '10581', title: 'Technical News — Main & Floor Harness per Nomor Seri', category: 'TECHNICAL NEWS', section: 'Harness applicability', revision: 'Rev. 1' }],
    },
    { type: 'markdown', content: newsMarkdown },
  ],
};

function FixtureAnswer({ presentation, markdown }: { presentation: unknown; markdown: string }) {
  const valid = validateAnswerPresentation(presentation, markdown);
  return (
    <article className="rich-fixture-answer">
      {valid && <AnswerPresentation presentation={valid} />}
      <div className="markdown-body"><Markdown>{markdown}</Markdown></div>
    </article>
  );
}

export function RichAnswersFixture() {
  useEffect(() => {
    const theme = new URLSearchParams(window.location.search).get('theme') === 'light' ? 'light' : 'dark';
    document.documentElement.classList.remove('dark-theme', 'light-theme');
    document.documentElement.classList.add(`${theme}-theme`);
  }, []);

  return (
    <main className="rich-fixture-shell">
      <header><h1>Rich Technical Answers</h1><p>Production renderer fixture</p></header>
      <FixtureAnswer presentation={spec} markdown={specMarkdown} />
      <FixtureAnswer presentation={news} markdown={newsMarkdown} />
      <FixtureAnswer presentation={{ version: 2, blocks: [] }} markdown="Payload unsupported harus tetap tampil sebagai Markdown biasa." />
    </main>
  );
}
