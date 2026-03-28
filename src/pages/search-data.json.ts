import { getAllLabs, getAllOutputsChronological } from '../data/loader.js';

export async function GET() {
  const labs = getAllLabs().map(l => ({
    type: 'lab',
    name: l.name,
    slug: l.slug,
    url: `/labs/${l.slug}`,
    sub: l.type || 'lab'
  }));

  const outputs = getAllOutputsChronological().map(o => ({
    type: 'output',
    name: o.name,
    slug: o.slug,
    url: `/outputs/${o._labSlug}/${o.slug}`,
    sub: o._labSlug,
    date: o.date
  }));

  return new Response(JSON.stringify([...labs, ...outputs]), {
    headers: { 'Content-Type': 'application/json' }
  });
}
