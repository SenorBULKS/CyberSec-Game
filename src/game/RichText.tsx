import { useId, useState, type ReactNode } from 'react';
import { lookupTerm } from './glossary';

/**
 * Renders the small markup used in challenge text: `code`, **bold**, and
 * [[term]] or [[term|shown words]] for a glossary word the player can open.
 * Opened definitions appear under the text, so the sentence stays whole.
 */
export function RichText({ text }: { text: string }) {
  const [open, setOpen] = useState<string[]>([]);
  const baseId = useId();
  const definitionId = (term: string) => `${baseId}-${term.replace(/\s+/g, '-')}`;
  const toggle = (term: string) =>
    setOpen((terms) => (terms.includes(term) ? terms.filter((t) => t !== term) : [...terms, term]));

  const parts = text.split(TOKEN).map((part, i) => {
    if (part.startsWith('[[') && part.endsWith(']]')) {
      const [term, shown] = part.slice(2, -2).split('|');
      const label = shown ?? term;
      if (!lookupTerm(term)) return label;
      return (
        <button
          key={i}
          type="button"
          className="term-word"
          aria-expanded={open.includes(term)}
          aria-controls={definitionId(term)}
          onClick={() => toggle(term)}
        >
          {label}
        </button>
      );
    }
    return renderFormatting(part, i);
  });

  return (
    <>
      {parts}
      {open.map((term) => (
        <span key={term} id={definitionId(term)} className="term-definition" role="note">
          <strong>{term}:</strong> {renderInline(lookupTerm(term) ?? '')}
        </span>
      ))}
    </>
  );
}

const TOKEN = /(`[^`]+`|\*\*[^*]+\*\*|\[\[[^\]]+\]\])/g;

function renderInline(text: string): ReactNode[] {
  return text.split(TOKEN).map(renderFormatting);
}

function renderFormatting(part: string, key: number): ReactNode {
  if (part.startsWith('`') && part.endsWith('`') && part.length > 1) {
    return <code key={key}>{part.slice(1, -1)}</code>;
  }
  if (part.startsWith('**') && part.endsWith('**')) {
    return <strong key={key}>{part.slice(2, -2)}</strong>;
  }
  return part;
}
