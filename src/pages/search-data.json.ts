import { getAllLabs, getAllOutputsChronological, getAllPeople } from '../data/loader.js';
import { isGrouped } from '../schema.js';

export async function GET() {
  const labs = getAllLabs().map(l => ({
    type: 'lab',
    name: l.name,
    slug: l.slug,
    url: `/labs/${l.slug}`,
    sub: l.type || 'lab'
  }));

  const people = getAllPeople().map(p => ({
    type: 'person',
    name: p.name,
    slug: p.slug,
    url: `/people/${p.slug}`,
    sub: p.affiliations.filter(a => a.current).map(a => a.labName).join(', ') || p.affiliations[0]?.labName || '',
    role: p.affiliations.find(a => a.current)?.role || p.affiliations[0]?.role || ''
  }));

  const outputs = getAllOutputsChronological().map(o => {
    const arxivIds = new Set<string>();
    if (o.paper?.arxiv) arxivIds.add(o.paper.arxiv);
    if (isGrouped(o)) {
      o.outputs.forEach(sub => {
        if (sub.paper?.arxiv) arxivIds.add(sub.paper.arxiv);
      });
    }

    return {
      type: 'output',
      name: o.name,
      slug: o.slug,
      url: `/outputs/${o._labSlug}/${o.slug}`,
      sub: o._labSlug,
      date: o.date,
      arxiv: Array.from(arxivIds).join(' ')
    };
  });

  return new Response(JSON.stringify([...labs, ...people, ...outputs]), {
    headers: { 'Content-Type': 'application/json' }
  });
}
