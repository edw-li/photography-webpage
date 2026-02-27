import { marked } from 'marked';
import type { Newsletter, NewsletterMeta } from '../types/newsletter';

function parseFrontmatter(raw: string): { meta: Record<string, string>; body: string } {
  const trimmed = raw.trimStart();
  if (!trimmed.startsWith('---')) {
    return { meta: {}, body: raw };
  }

  const end = trimmed.indexOf('---', 3);
  if (end === -1) {
    return { meta: {}, body: raw };
  }

  const frontmatterBlock = trimmed.slice(3, end);
  const body = trimmed.slice(end + 3).trim();
  const meta: Record<string, string> = {};

  for (const line of frontmatterBlock.split('\n')) {
    const colonIdx = line.indexOf(':');
    if (colonIdx === -1) continue;
    const key = line.slice(0, colonIdx).trim();
    let value = line.slice(colonIdx + 1).trim();
    // Strip surrounding quotes
    if ((value.startsWith('"') && value.endsWith('"')) ||
        (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (key) meta[key] = value;
  }

  return { meta, body };
}

export function parseNewsletter(filename: string, raw: string): Newsletter {
  const { meta, body } = parseFrontmatter(raw);

  const id = filename
    .replace(/^.*[\\/]/, '')  // strip path
    .replace(/\.md$/, '');     // strip extension

  const newsletterMeta: NewsletterMeta = {
    title: meta.title || id,
    date: meta.date || '',
    category: meta.category || 'Uncategorized',
    author: meta.author || '',
    preview: meta.preview || '',
    featured: meta.featured === 'true',
  };

  const html = marked.parse(body, { async: false }) as string;

  return { ...newsletterMeta, id, html };
}
