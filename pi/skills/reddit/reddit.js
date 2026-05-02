#!/usr/bin/env node
// Lightweight Reddit reader using https://www.reddit.com/.json endpoints.
// No API key required; uses public JSON.
// Usage: reddit.js <command> [options]

const args = process.argv.slice(2);
const USAGE = `Usage: reddit.js <command> [options]

Commands:
  search <query>   Search all of Reddit
  top <subreddit>  Top posts in a subreddit
  post <url-or-id>  Read a single post + comments

Options:
  --limit N        Max results (default 10)
  --sort <val>      For search: relevance, hot, new, top, comments
  --time <val>      For top: hour, day, week, month, year, all
  --depth N        For post: comment depth (default 5)
`;

if (args.length === 0 || args[0].startsWith("-")) {
  console.error(USAGE);
  process.exit(1);
}

const cmd = args[0];
const rest = args.slice(1);

function parseOpts(args) {
  const out = { limit: 10, sort: "relevance", time: "all", depth: 5, _target: undefined, _query: undefined };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === "--limit" && args[i + 1]) { out.limit = Number(args[i + 1]) || out.limit; i++; }
    if (args[i] === "--sort" && args[i + 1]) { out.sort = args[i + 1]; i++; }
    if (args[i] === "--time" && args[i + 1]) { out.time = args[i + 1]; i++; }
    if (args[i] === "--depth" && args[i + 1]) { out.depth = Number(args[i + 1]) || out.depth; i++; }
    if (!args[i].startsWith("-")) {
      if (cmd === "search") out._query = args[i];
      else out._target = args[i];
    }
  }
  return out;
}

function redditUrl(path) {
  const base = "https://www.reddit.com";
  return `${base}${path}.json`;
}

async function fetchJson(url) {
  const res = await fetch(url, {
    headers: {
      "User-Agent": "Pi/1.0 (+https://github.com/badlogic/pi)",
    },
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  return res.json();
}

function formatPost(p, prefix = "") {
  const lines = [
    `${prefix}Title: ${p.title}`,
    `${prefix}URL: https://www.reddit.com${p.permalink}`,
    `${prefix}Author: ${p.author}`,
    `${prefix}Score: ${p.score}  Comments: ${p.num_comments}`,
    `${prefix}Created: ${new Date(p.created_utc * 1000).toISOString()}`,
  ];
  if (p.selftext) lines.push(`${prefix}Text: ${p.selftext.slice(0, 500)}`);
  return lines.join("\n");
}

async function cmdSearch(opts) {
  const q = opts._query;
  if (!q) { console.error("Error: search requires a query"); process.exit(1); }
  const url = `https://www.reddit.com/search.json?q=${encodeURIComponent(q)}&sort=${opts.sort}&limit=${opts.limit}`;
  const data = await fetchJson(url);
  const posts = (data.data?.children || []).map(c => c.data);
  if (posts.length === 0) { console.log("No results found."); return; }
  posts.forEach((p, i) => console.log(formatPost(p, `${i + 1}. `)));
}

async function cmdTop(opts) {
  const sub = opts._target;
  if (!sub) { console.error("Error: top requires a subreddit name"); process.exit(1); }
  const url = `https://www.reddit.com/r/${sub}/top.json?limit=${opts.limit}&t=${opts.time}`;
  const data = await fetchJson(url);
  const posts = (data.data?.children || []).map(c => c.data);
  if (posts.length === 0) { console.log("No posts found."); return; }
  posts.forEach((p, i) => console.log(formatPost(p, `${i + 1}. `)));
}

function collectComments(children, depth, maxDepth, out, prefix) {
  for (const c of children) {
    if (depth > maxDepth) break;
    const d = c.data;
    out.push(`${prefix}[${depth}] ${d.author}: ${d.body?.slice(0, 300)}`);
    if (d.replies?.data?.children) {
      collectComments(d.replies.data.children, depth + 1, maxDepth, out, prefix + "  ");
    }
  }
}

async function cmdPost(opts) {
  const arg = opts._target;
  if (!arg) { console.error("Error: post requires a URL or ID"); process.exit(1); }
  let permalink;
  try {
    const u = new URL(arg);
    permalink = u.pathname;
  } catch {
    permalink = `/comments/${arg}`;
  }
  const url = `https://www.reddit.com${permalink}.json?limit=${opts.limit}`;
  const data = await fetchJson(url);
  const post = data[0]?.data?.children?.[0]?.data;
  if (!post) { console.error("Error: post not found"); process.exit(1); }
  console.log(formatPost(post));
  console.log("\n--- Comments ---");
  const comments = data[1]?.data?.children || [];
  const out = [];
  collectComments(comments, 1, opts.depth, out, "");
  console.log(out.join("\n"));
}

(async () => {
  try {
    const opts = parseOpts(rest);
    if (cmd === "search") await cmdSearch(opts);
    else if (cmd === "top") await cmdTop(opts);
    else if (cmd === "post") await cmdPost(opts);
    else { console.error(`Unknown command: ${cmd}\n${USAGE}`); process.exit(1); }
  } catch (e) {
    console.error(`Error: ${e.message}`);
    process.exit(1);
  }
})();
