import { readFileSync } from 'fs';
import { basename } from 'path';
import { glob } from 'glob';
import { parse } from 'yaml';

// Candidate HuggingFace and GitHub orgs to probe for each lab: the orgs its
// own lab file declares, plus every other org its existing outputs link to.
//
// Why this exists: a lab file has exactly one `huggingface:` and one `github:`
// field, but labs routinely ship from several orgs. Sweeps keyed to the lab
// field alone have missed real releases: Moonshot's AgentENV and three other
// repos from the Kimi K3 launch sat under `kvcache-ai` for ten weeks; LG's
// time-series and tabular weights went public under `LG-AI-Research` while the
// lab file points at `LGAI-EXAONE`; Apple's LensVLM shipped under `apple` with
// no blog post. Each lab's *secondary* orgs are already visible in its existing
// outputs' source URLs, so derive them instead of remembering them.
//
// This is a candidate list, not an assertion of ownership: a citation to
// another lab's repo shows up here too (an LG entry citing GIFT-Eval surfaces
// `SalesforceAIResearch`). Skim before probing; a wrong guess costs one call.
//
// Usage: npm run sweep-orgs            # every lab
//        npm run sweep-orgs moonshot-ai google

const HOSTS = {
  // The org is the first path segment, except behind /datasets/, /collections/
  // and /spaces/, where it is the second — dataset links are a common way a
  // lab's second org appears at all, so missing them defeats the probe.
  huggingface: /https?:\/\/huggingface\.co\/(?:api\/(?:models|datasets)\?author=|(?:datasets|collections|spaces)\/)?([^/\s"')\]]+)/g,
  github: /https?:\/\/github\.com\/([^/\s"')\]]+)/g,
} as const;

// Path segments that follow the host but are not an org.
const NOT_AN_ORG = new Set([
  'collections', 'datasets', 'spaces', 'blog', 'papers', 'models', 'docs',
  'organizations', 'settings', 'join', 'login', 'search', 'orgs', 'about',
  'features', 'pricing', 'topics', 'collections?', 'api',
]);

export type Source = 'lab field' | 'outputs';

/** Every `host:org` referenced in `text`, minus path segments that are not orgs. */
export function harvestOrgs(text: string, host: keyof typeof HOSTS): string[] {
  const re = new RegExp(HOSTS[host].source, 'g');
  const found: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    const org = m[1].replace(/[.,;:]+$/, '');
    if (!org || NOT_AN_ORG.has(org.toLowerCase())) continue;
    found.push(`${host}:${org}`);
  }
  return found;
}

function harvest(text: string, into: Map<string, Set<Source>>, host: keyof typeof HOSTS, origin: Source) {
  for (const key of harvestOrgs(text, host)) {
    if (!into.has(key)) into.set(key, new Set());
    into.get(key)!.add(origin);
  }
}

async function main() {
  const only = new Set(process.argv.slice(2));
  const labFiles = (await glob('data/labs/*.yaml')).sort();
  let totalSecondary = 0;

  for (const labFile of labFiles) {
    const slug = basename(labFile, '.yaml');
    if (only.size && !only.has(slug)) continue;

    const lab = parse(readFileSync(labFile, 'utf-8')) ?? {};
    const orgs = new Map<string, Set<Source>>();

    // The declared orgs, from the lab file's own fields.
    for (const host of ['huggingface', 'github'] as const) {
      if (typeof lab[host] === 'string') harvest(lab[host], orgs, host, 'lab field');
    }
    const declared = new Set(orgs.keys());

    // Everything the lab's outputs actually link to.
    const outputFiles = await glob(`data/outputs/${slug}/*.yaml`);
    for (const f of outputFiles) {
      const text = readFileSync(f, 'utf-8');
      for (const host of ['huggingface', 'github'] as const) harvest(text, orgs, host, 'outputs');
    }

    const secondary = [...orgs.keys()].filter((k) => !declared.has(k)).sort();
    if (!declared.size && !secondary.length) continue;

    totalSecondary += secondary.length;
    console.log(`\n${slug}`);
    for (const k of [...declared].sort()) console.log(`  declared  ${k}`);
    for (const k of secondary) console.log(`  secondary ${k}`);
  }

  console.log(`\nProbe the secondary orgs too, not just the declared ones (${totalSecondary} across the labs shown).`);
  console.log('Some are citations to other labs rather than this lab\'s own org — skim first.');
  console.log('HF:     curl -sL "https://huggingface.co/api/models?author=<org>&sort=createdAt&direction=-1&limit=30"');
  console.log('GitHub: gh api "orgs/<org>/repos?per_page=100&sort=created&direction=desc"');
}

if (import.meta.url === `file://${process.argv[1]}`) main();
