import { getAllLabs, getAllOutputsChronological } from '../data/loader.js';
import { isGrouped } from '../schema.js';

export async function GET() {
  const labs = getAllLabs().map(l => ({
    type: 'lab',
    name: l.name,
    slug: l.slug,
    url: `/labs/${l.slug}`,
    sub: l.type || 'lab'
  }));

  const people: any[] = [];
  getAllLabs().forEach(l => {
    if (l.people) {
      l.people.forEach(p => {
        people.push({
          type: 'person',
          name: p.name,
          slug: l.slug,
          url: `/labs/${l.slug}`,
          sub: l.name,
          role: p.role
        });
      });
    }
  });

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
