/**
 * Fetch impact metrics for all outputs.
 *
 * Queries GitHub API, HuggingFace API, and Semantic Scholar API
 * to gather stars, downloads, and citation counts.
 *
 * Usage:
 *   npm run fetch-metrics
 *   GITHUB_TOKEN=ghp_xxx npm run fetch-metrics   # higher rate limit
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { globSync } from 'glob';
import { parse } from 'yaml';

// ── Types ──

interface MetricsEntry {
  github_stars?: number;
  github_forks?: number;
  hf_downloads?: number;
  hf_likes?: number;
  citations?: number;
  fetched_at: string;
}

interface OutputIdentifiers {
  githubRepos: Set<string>;   // "owner/repo"
  hfModels: Set<string>;      // "org/model"
  arxivIds: Set<string>;      // "2401.12345"
}

type MetricsMap = Record<string, MetricsEntry>;

// ── URL extraction ──

function extractGitHubRepo(url: string): string | null {
  const m = url.match(/github\.com\/([^/]+\/[^/]+)/);
  if (!m) return null;
  return m[1].replace(/\.git$/, '').replace(/\/+$/, '');
}

function extractHuggingFaceModel(url: string): string | null {
  // Must be huggingface.co/{org}/{model} but NOT /datasets/ /spaces/ /docs/ /blog/ /papers/
  const m = url.match(/huggingface\.co\/(?!datasets\/)(?!spaces\/)(?!docs\/)(?!blog\/)(?!papers\/)([^/]+\/[^/?#]+)/);
  if (!m) return null;
  const path = m[1];
  // Skip API paths and other non-model paths
  if (path.startsWith('api/') || path.startsWith('docs/')) return null;
  return path;
}

function extractArxivId(value: string): string | null {
  const m = value.match(/(\d{4}\.\d{4,5})/);
  return m ? m[1] : null;
}

function extractIdentifiers(yamlData: any): OutputIdentifiers {
  const ids: OutputIdentifiers = {
    githubRepos: new Set(),
    hfModels: new Set(),
    arxivIds: new Set(),
  };

  function scanSources(sources?: { url: string }[]) {
    if (!sources) return;
    for (const s of sources) {
      const gh = extractGitHubRepo(s.url);
      if (gh) ids.githubRepos.add(gh);
      const hf = extractHuggingFaceModel(s.url);
      if (hf) ids.hfModels.add(hf);
      const arxiv = extractArxivId(s.url);
      if (arxiv) ids.arxivIds.add(arxiv);
    }
  }

  // Top-level sources
  scanSources(yamlData.sources);

  // Top-level paper/library/dataset fields
  if (yamlData.paper?.arxiv) {
    const id = extractArxivId(yamlData.paper.arxiv);
    if (id) ids.arxivIds.add(id);
  }
  if (yamlData.library?.github) {
    const gh = extractGitHubRepo(yamlData.library.github);
    if (gh) ids.githubRepos.add(gh);
  }
  if (yamlData.dataset?.github) {
    const gh = extractGitHubRepo(yamlData.dataset.github);
    if (gh) ids.githubRepos.add(gh);
  }

  // Grouped sub-outputs
  if (yamlData.outputs && Array.isArray(yamlData.outputs)) {
    for (const sub of yamlData.outputs) {
      scanSources(sub.sources);
      if (sub.paper?.arxiv) {
        const id = extractArxivId(sub.paper.arxiv);
        if (id) ids.arxivIds.add(id);
      }
      if (sub.library?.github) {
        const gh = extractGitHubRepo(sub.library.github);
        if (gh) ids.githubRepos.add(gh);
      }
      if (sub.dataset?.github) {
        const gh = extractGitHubRepo(sub.dataset.github);
        if (gh) ids.githubRepos.add(gh);
      }
    }
  }

  return ids;
}

// ── Rate-limited fetch ──

async function delay(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

const GITHUB_TOKEN = process.env.GITHUB_TOKEN;

async function fetchJSON(url: string, headers?: Record<string, string>): Promise<any | null> {
  try {
    const res = await fetch(url, { headers });
    if (res.status === 404) return null;
    if (res.status === 403 || res.status === 429) {
      console.warn(`  Rate limited: ${url}`);
      return null;
    }
    if (!res.ok) {
      console.warn(`  HTTP ${res.status}: ${url}`);
      return null;
    }
    return await res.json();
  } catch (err: any) {
    console.warn(`  Fetch error: ${url} - ${err.message}`);
    return null;
  }
}

// ── GitHub API ──

async function fetchGitHubRepo(repo: string): Promise<{ stars: number; forks: number } | null> {
  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
  };
  if (GITHUB_TOKEN) headers.Authorization = `Bearer ${GITHUB_TOKEN}`;
  const data = await fetchJSON(`https://api.github.com/repos/${repo}`, headers);
  if (!data || data.stargazers_count === undefined) return null;
  return { stars: data.stargazers_count, forks: data.forks_count ?? 0 };
}

// ── HuggingFace API ──

async function fetchHuggingFaceModel(modelId: string): Promise<{ downloads: number; likes: number } | null> {
  const data = await fetchJSON(`https://huggingface.co/api/models/${modelId}`);
  if (!data) return null;
  return {
    downloads: data.downloads ?? data.downloadsAllTime ?? 0,
    likes: data.likes ?? 0,
  };
}

// ── OpenAlex API ──

async function fetchOpenAlex(arxivId: string): Promise<{ citations: number } | null> {
  const data = await fetchJSON(
    `https://api.openalex.org/works/doi:10.48550/arXiv.${arxivId}`,
    { 'User-Agent': 'mailto:ai-lab-tracker@example.com' }
  );
  if (!data || data.cited_by_count === undefined) return null;
  return { citations: data.cited_by_count };
}

// ── Main ──

async function main() {
  const metricsPath = 'data/metrics.json';
  const existing: MetricsMap = existsSync(metricsPath)
    ? JSON.parse(readFileSync(metricsPath, 'utf-8'))
    : {};

  // Max age for cached entries (default: 24 hours)
  const maxAgeMs = 24 * 60 * 60 * 1000;

  // Load all output YAML files
  const files = globSync('data/outputs/**/*.yaml').sort();
  console.log(`Found ${files.length} output files`);

  // Extract identifiers per output
  const outputIds = new Map<string, OutputIdentifiers>();
  for (const file of files) {
    const raw = readFileSync(file, 'utf-8');
    const data = parse(raw);
    const dirSlug = file.split('/').at(-2)!;
    const key = `${dirSlug}/${data.slug}`;
    outputIds.set(key, extractIdentifiers(data));
  }

  // Determine which outputs need refreshing
  const now = new Date();
  const keysToFetch = [...outputIds.keys()].filter((key) => {
    const e = existing[key];
    if (!e) return true;
    const age = now.getTime() - new Date(e.fetched_at).getTime();
    return age > maxAgeMs;
  });

  console.log(`${keysToFetch.length} outputs need refresh (${outputIds.size - keysToFetch.length} cached)`);

  if (keysToFetch.length === 0) {
    console.log('All metrics are fresh. Done.');
    return;
  }

  // Deduplicate identifiers across all outputs needing refresh
  const allGitHubRepos = new Set<string>();
  const allHfModels = new Set<string>();
  const allArxivIds = new Set<string>();

  for (const key of keysToFetch) {
    const ids = outputIds.get(key)!;
    ids.githubRepos.forEach((r) => allGitHubRepos.add(r));
    ids.hfModels.forEach((m) => allHfModels.add(m));
    ids.arxivIds.forEach((a) => allArxivIds.add(a));
  }

  console.log(`Unique identifiers: ${allGitHubRepos.size} GitHub repos, ${allHfModels.size} HF models, ${allArxivIds.size} ArXiv papers`);

  // Fetch GitHub metrics (deduplicated)
  const githubCache = new Map<string, { stars: number; forks: number }>();
  const ghRepos = [...allGitHubRepos];
  const ghDelay = GITHUB_TOKEN ? 200 : 1200; // ~50/min authed, ~50/min unauthed
  console.log(`\nFetching GitHub stars (${ghRepos.length} repos, ${ghDelay}ms delay)...`);
  for (let i = 0; i < ghRepos.length; i++) {
    const repo = ghRepos[i];
    process.stdout.write(`  [${i + 1}/${ghRepos.length}] ${repo}`);
    const result = await fetchGitHubRepo(repo);
    if (result) {
      githubCache.set(repo, result);
      process.stdout.write(` → ${result.stars.toLocaleString()} stars\n`);
    } else {
      process.stdout.write(` → skip\n`);
    }
    if (i < ghRepos.length - 1) await delay(ghDelay);
  }

  // Fetch HuggingFace metrics (deduplicated)
  const hfCache = new Map<string, { downloads: number; likes: number }>();
  const hfModels = [...allHfModels];
  console.log(`\nFetching HuggingFace downloads (${hfModels.length} models, 500ms delay)...`);
  for (let i = 0; i < hfModels.length; i++) {
    const model = hfModels[i];
    process.stdout.write(`  [${i + 1}/${hfModels.length}] ${model}`);
    const result = await fetchHuggingFaceModel(model);
    if (result) {
      hfCache.set(model, result);
      process.stdout.write(` → ${result.downloads.toLocaleString()} downloads\n`);
    } else {
      process.stdout.write(` → skip\n`);
    }
    if (i < hfModels.length - 1) await delay(500);
  }

  // Fetch OpenAlex citations (deduplicated)
  const citationCache = new Map<string, number>();
  const arxivIds = [...allArxivIds];
  console.log(`\nFetching OpenAlex citations (${arxivIds.length} papers, 200ms delay)...`);
  for (let i = 0; i < arxivIds.length; i++) {
    const id = arxivIds[i];
    process.stdout.write(`  [${i + 1}/${arxivIds.length}] ${id}`);
    const result = await fetchOpenAlex(id);
    if (result) {
      citationCache.set(id, result.citations);
      process.stdout.write(` → ${result.citations.toLocaleString()} citations\n`);
    } else {
      process.stdout.write(` → skip\n`);
    }
    if (i < arxivIds.length - 1) await delay(200);
  }

  // Aggregate metrics per output
  const metrics: MetricsMap = { ...existing };
  const timestamp = now.toISOString();

  for (const key of keysToFetch) {
    const ids = outputIds.get(key)!;
    const entry: MetricsEntry = { fetched_at: timestamp };

    // GitHub: take the repo with most stars
    let maxStars = 0;
    let maxForks = 0;
    for (const repo of ids.githubRepos) {
      const gh = githubCache.get(repo);
      if (gh && gh.stars > maxStars) {
        maxStars = gh.stars;
        maxForks = gh.forks;
      }
    }
    if (maxStars > 0) {
      entry.github_stars = maxStars;
      entry.github_forks = maxForks;
    }

    // HuggingFace: sum downloads across all models, take max likes
    let totalDownloads = 0;
    let maxLikes = 0;
    for (const model of ids.hfModels) {
      const hf = hfCache.get(model);
      if (hf) {
        totalDownloads += hf.downloads;
        if (hf.likes > maxLikes) maxLikes = hf.likes;
      }
    }
    if (totalDownloads > 0) entry.hf_downloads = totalDownloads;
    if (maxLikes > 0) entry.hf_likes = maxLikes;

    // Citations: sum across all papers
    let totalCitations = 0;
    for (const id of ids.arxivIds) {
      const c = citationCache.get(id);
      if (c) totalCitations += c;
    }
    if (totalCitations > 0) entry.citations = totalCitations;

    metrics[key] = entry;
  }

  // Write results
  const sorted = Object.fromEntries(Object.entries(metrics).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(metricsPath, JSON.stringify(sorted, null, 2) + '\n');
  console.log(`\nWrote ${Object.keys(sorted).length} entries to ${metricsPath}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
