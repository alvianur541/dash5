import { BookOpen, Gauge, Newspaper } from 'lucide-react';
import type { AnswerPresentationV1, PresentationSource, SpecValueBlock, TechnicalNewsBlock } from '../types';

function Source({ source }: { source: PresentationSource }) {
  return (
    <div className="rich-source">
      <BookOpen size={15} strokeWidth={1.8} aria-hidden="true" />
      <span>
        <strong>{source.title}</strong>
        <span>{source.category}{source.section ? ` · ${source.section}` : ''}{source.revision ? ` · ${source.revision}` : ''}</span>
      </span>
    </div>
  );
}

function SpecificationCard({ block }: { block: SpecValueBlock }) {
  return (
    <section className="rich-card rich-spec-card" aria-label="Spesifikasi teknis terverifikasi">
      <header className="rich-card-head">
        <span className="rich-card-kind"><Gauge size={16} strokeWidth={1.9} aria-hidden="true" />Spesifikasi</span>
        <span className="rich-model">{block.unitModel}</span>
      </header>
      <div className="rich-spec-main">
        <h3>{block.label}</h3>
        <p className="rich-value"><span>{block.value}</span><span>{block.unit}</span></p>
      </div>
      {!!block.alternateValues?.length && (
        <div className="rich-alternates" aria-label="Nilai alternatif">
          {block.alternateValues.map((item, index) => <span key={`${item.value}-${item.unit}-${index}`}>{item.value} {item.unit}</span>)}
        </div>
      )}
      {!!block.facts?.length && (
        <dl className="rich-facts">
          {block.facts.map((fact, index) => (
            <div key={`${fact.label}-${index}`}><dt>{fact.label}</dt><dd>{fact.value}</dd></div>
          ))}
        </dl>
      )}
      <div className="rich-sources" aria-label="Sumber spesifikasi">
        {block.sources.map(source => <Source key={source.documentId} source={source} />)}
      </div>
    </section>
  );
}

function TechnicalNewsCard({ block }: { block: TechnicalNewsBlock }) {
  return (
    <section className="rich-card rich-news-card" aria-label="Technical News terverifikasi">
      <header className="rich-card-head">
        <span className="rich-card-kind"><Newspaper size={16} strokeWidth={1.9} aria-hidden="true" />Technical News</span>
        {block.date && <time>{block.date}</time>}
      </header>
      {block.bulletinId && <p className="rich-bulletin">{block.bulletinId}</p>}
      <h3 className="rich-news-title">{block.title}</h3>
      <dl className="rich-news-meta">
        <div><dt>Model terdampak</dt><dd>{block.affectedModels.join(', ')}</dd></div>
      </dl>
      <div className="rich-sources" aria-label="Sumber Technical News">
        {block.sources.map(source => <Source key={source.documentId} source={source} />)}
      </div>
    </section>
  );
}

export function AnswerPresentation({ presentation }: { presentation: AnswerPresentationV1 }) {
  const cards = presentation.blocks.filter(block => block.type !== 'markdown');
  if (!cards.length) return null;
  return (
    <div className="rich-presentation">
      {cards.map((block, index) => block.type === 'spec_value'
        ? <SpecificationCard key={`spec-${index}`} block={block} />
        : <TechnicalNewsCard key={`news-${index}`} block={block} />)}
    </div>
  );
}
