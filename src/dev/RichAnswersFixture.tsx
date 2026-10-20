import { useEffect } from 'react';
import { AnswerPresentation } from '../components/AnswerPresentation';
import Markdown from '../components/Markdown';
import { validateAnswerPresentation } from '../lib/presentation';
import type { AnswerPresentationBlockV1 } from '../types';

const travelSource = { documentId: '7605', title: 'WDCD-EN-00 Workshop Manual', category: 'WORKSHOP MANUAL', section: 'TRAVEL DEVICE - REMOVAL & INSTALLATION' };

const samples: Array<[AnswerPresentationBlockV1 | null, string]> = [
  [{
    type: 'spec_value', label: 'Torsi baut flywheel', value: '197–240', unit: 'N·m', unitModel: 'ZX200-5G',
    alternateValues: [{ value: '20.1–24.5', unit: 'kgf·m' }, { value: '145–177', unit: 'lb·ft' }],
    sources: [{ documentId: '8377', title: 'EDCD-EN-00 Engine Manual (Isuzu 6BG1T Workshop Service Manual)', category: 'ENGINE MANUAL', section: 'GENERAL INFORMATION - TIGHTENING TORQUE STANDARDS (Bolts & Nuts)' }],
  }, 'Torsi pengencangan baut flywheel adalah `197–240 N·m` (`20.1–24.5 kgf·m` / `145–177 lb·ft`).'],
  [{
    type: 'spec_table', title: 'Berat travel device', unitModel: 'ZX200-5G', sources: [travelSource],
    rows: [
      { label: 'Travel Device (assembly)', value: '310', unit: 'kg', alternateValues: [{ value: '685', unit: 'lb' }] },
      { label: 'Ring gear', value: '39', unit: 'kg', alternateValues: [{ value: '86', unit: 'lb' }] },
      { label: 'Sprocket + drum', value: '96', unit: 'kg', alternateValues: [{ value: '215', unit: 'lb' }] },
    ],
  }, '- **Travel Device (assembly):** `310 kg` (`685 lb`)\n- **Ring gear:** `39 kg` (`86 lb`)\n- **Sprocket + drum:** `96 kg` (`215 lb`)'],
  [{
    type: 'technical_news', bulletinId: '06/TSD-CE/TN/9/2023', date: '2023-09-06', title: 'Main & Floor Harness per Nomor Seri',
    affectedModels: ['ZX48U-5A'], sources: [{ documentId: '10581', title: 'Technical News — Main & Floor Harness per Nomor Seri', category: 'TECHNICAL NEWS' }],
  }, 'Technical News **06/TSD-CE/TN/9/2023** menjelaskan perubahan Main & Floor Harness untuk ZX48U-5A.'],
  [null, 'Payload tidak valid tetap tampil sebagai Markdown biasa.'],
];

export function RichAnswersFixture() {
  useEffect(() => {
    const theme = new URLSearchParams(window.location.search).get('theme') === 'light' ? 'light' : 'dark';
    document.documentElement.classList.remove('dark-theme', 'light-theme');
    document.documentElement.classList.add(`${theme}-theme`);
  }, []);

  return (
    <main className="rich-fixture-shell">
      <header><h1>Rich Technical Answers</h1><p>Production renderer fixture</p></header>
      {samples.map(([block, markdown], i) => {
        const valid = validateAnswerPresentation(block && { version: 1, blocks: [block, { type: 'markdown', content: markdown }] }, markdown);
        return (
          <article key={i} className="rich-fixture-answer">
            {valid && <AnswerPresentation presentation={valid} />}
            <div className="markdown-body"><Markdown>{markdown}</Markdown></div>
          </article>
        );
      })}
    </main>
  );
}
