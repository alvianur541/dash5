// Renderer markdown — SATU-SATUNYA modul yang boleh mengimpor react-markdown,
// remark-gfm, dan rehype-sanitize secara statis. Semua pemakai WAJIB memuatnya via
// React.lazy(). Alasannya: remark-gfm + rehype-sanitize menyeret micromark/mdast/hast
// (~163 KB) ke bundle. Dulu ketiganya diimpor langsung di ChatWindow & PocketModal,
// jadi cuma komponen ReactMarkdown-nya yang lazy sementara seluruh parser-nya tetap
// ikut chunk awal. Dikumpulkan di sini → parser baru diunduh saat markdown pertama
// benar-benar dirender (yaitu saat ada jawaban AI), bukan saat app dibuka.
import ReactMarkdown, { type Components } from 'react-markdown';
import rehypeSanitize, { defaultSchema } from 'rehype-sanitize';
import remarkGfm from 'remark-gfm';

// Strict markdown sanitize schema — block iframe, embed, object, form, dll.
// Whitelist explicit tag yang aman untuk teknis content (table, code, dll).
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

const REMARK_PLUGINS = [remarkGfm];
const REHYPE_PLUGINS = [[rehypeSanitize, SANITIZE_SCHEMA]] as never;

export default function MarkdownView({
  children, components,
}: { children: string; components?: Components }) {
  return (
    <ReactMarkdown
      remarkPlugins={REMARK_PLUGINS}
      rehypePlugins={REHYPE_PLUGINS}
      components={components}
    >{children}</ReactMarkdown>
  );
}
