import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

const SANITIZE_SCHEMA = {
  ...defaultSchema,
  tagNames: [
    'p', 'br', 'strong', 'em', 'code', 'pre', 'blockquote',
    'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6',
    'table', 'thead', 'tbody', 'tr', 'th', 'td',
    'a', 'span', 'div', 'hr',
  ],
  attributes: {
    ...defaultSchema.attributes,
    a: [['href', /^(https?:\/\/|mailto:|tel:)/i], 'title'],
    code: ['className'],
    span: ['className'],
    div: ['className'],
  },
  protocols: { href: ['http', 'https', 'mailto', 'tel'] },
};

// Whole markdown stack lives behind one lazy boundary — nothing here may be imported statically.
export default function Markdown({ children, components }: { children: string; components?: Components }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      rehypePlugins={[[rehypeSanitize, SANITIZE_SCHEMA]]}
      components={components}
    >{children}</ReactMarkdown>
  );
}
