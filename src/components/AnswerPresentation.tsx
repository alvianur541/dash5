import { BookOpen, Gauge, Newspaper } from 'lucide-react';
import type { ReactNode } from 'react';
import type { AnswerPresentationV1, PresentationSource, SpecTableBlock, SpecValueBlock, TechnicalNewsBlock } from '../types';

const alt = (values?: SpecValueBlock['alternateValues']) => values?.map(v => `${v.value} ${v.unit}`).join(' · ');

function Card({ label, kind, icon, chip, children, sources }: {
  label: string; kind: string; icon: ReactNode; chip?: string; children: ReactNode; sources: PresentationSource[];
}) {
  return (
    <section className="rich-card" aria-label={label}>
      <header className="rich-card-head">
        <span className="rich-card-kind">{icon}{kind}</span>
        {chip && <span className="rich-chip">{chip}</span>}
      </header>
      {children}
      <div className="rich-sources">
        {sources.map(s => (
          <div key={s.documentId} className="rich-source">
            <BookOpen size={15} strokeWidth={1.8} aria-hidden="true" />
            <span>
              <strong>{s.title}</strong>
              <span>{[s.category, s.section, s.revision].filter(Boolean).join(' · ')}</span>
            </span>
          </div>
        ))}
      </div>
    </section>
  );
}

const specIcon = <Gauge size={16} strokeWidth={1.9} aria-hidden="true" />;

function SpecValue({ block }: { block: SpecValueBlock }) {
  return (
    <Card label="Spesifikasi teknis terverifikasi" kind="Spesifikasi" icon={specIcon} chip={block.unitModel} sources={block.sources}>
      <h3 className="rich-title">{block.label}</h3>
      <p className="rich-value"><span>{block.value}</span><span>{block.unit}</span></p>
      {block.alternateValues && <p className="rich-alt">{alt(block.alternateValues)}</p>}
      {block.facts && (
        <dl className="rich-facts">
          {block.facts.map((f, i) => <div key={i}><dt>{f.label}</dt><dd>{f.value}</dd></div>)}
        </dl>
      )}
    </Card>
  );
}

function SpecTable({ block }: { block: SpecTableBlock }) {
  return (
    <Card label="Spesifikasi teknis terverifikasi" kind="Spesifikasi" icon={specIcon} chip={block.unitModel} sources={block.sources}>
      <h3 className="rich-title">{block.title}</h3>
      <dl className="rich-rows">
        {block.rows.map((r, i) => (
          <div key={i}>
            <dt>{r.label}</dt>
            <dd><b>{r.value}</b> {r.unit}{r.alternateValues && <small>{alt(r.alternateValues)}</small>}</dd>
          </div>
        ))}
      </dl>
    </Card>
  );
}

function News({ block }: { block: TechnicalNewsBlock }) {
  return (
    <Card label="Technical News terverifikasi" kind="Technical News" icon={<Newspaper size={16} strokeWidth={1.9} aria-hidden="true" />} chip={block.date} sources={block.sources}>
      {block.bulletinId && <p className="rich-bulletin">{block.bulletinId}</p>}
      <h3 className="rich-title">{block.title}</h3>
      <dl className="rich-facts">
        <div><dt>Model terdampak</dt><dd>{block.affectedModels.join(', ')}</dd></div>
      </dl>
    </Card>
  );
}

export function AnswerPresentation({ presentation }: { presentation: AnswerPresentationV1 }) {
  const block = presentation.blocks[0];
  return (
    <div className="rich-presentation">
      {block.type === 'spec_value' && <SpecValue block={block} />}
      {block.type === 'spec_table' && <SpecTable block={block} />}
      {block.type === 'technical_news' && <News block={block} />}
    </div>
  );
}
