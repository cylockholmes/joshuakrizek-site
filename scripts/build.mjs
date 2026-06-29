// Build script: pulls the "Blog Posts" database from Notion and renders a
// static site into ./dist. Run with: NOTION_TOKEN=secret_xxx npm run build
//
// You edit posts in Notion; GitHub Actions re-runs this build and redeploys.

import { mkdir, writeFile, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const DIST = path.join(ROOT, "dist");

// ---- Config -----------------------------------------------------------------
const NOTION_TOKEN = process.env.NOTION_TOKEN;
// The "Blog Posts" database created during the migration.
const DATABASE_ID =
  process.env.NOTION_DATABASE_ID || "ee5c13ef-3b7a-4ccb-a28e-9acb92898e3a";

const SITE = {
  name: "Joshua Krizek",
  tagline: "Aspiring ethical hacker",
  intro:
    "Write-ups and walkthroughs from my journey into offensive security — HackTheBox and TCM PEH machines, tooling guides, and the occasional security war story.",
  email: "hello@joshuakrizek.com",
  github: "https://github.com/cylockholmes/",
  linkedin: "https://www.linkedin.com/in/joshua-krizek/",
  year: new Date().getFullYear(),
};

// Notion client is created lazily in main() so the render helpers can be
// imported and tested without the @notionhq/client dependency installed.
let notion;

// ---- Helpers ----------------------------------------------------------------
const esc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

const slugify = (s = "") =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "post";

function plain(rt = []) {
  return rt.map((t) => t.plain_text).join("");
}

function richText(rt = []) {
  return rt
    .map((t) => {
      let out = esc(t.plain_text);
      const a = t.annotations || {};
      if (a.code) out = `<code>${out}</code>`;
      if (a.bold) out = `<strong>${out}</strong>`;
      if (a.italic) out = `<em>${out}</em>`;
      if (a.strikethrough) out = `<s>${out}</s>`;
      if (a.underline) out = `<u>${out}</u>`;
      if (t.href) out = `<a href="${esc(t.href)}" rel="noopener">${out}</a>`;
      return out;
    })
    .join("");
}

function imageUrl(block) {
  const img = block.image;
  if (!img) return null;
  return img.type === "external" ? img.external.url : img.file?.url;
}

// Fetch every block under a parent, following pagination.
async function fetchBlocks(blockId) {
  const blocks = [];
  let cursor;
  do {
    const res = await notion.blocks.children.list({
      block_id: blockId,
      start_cursor: cursor,
      page_size: 100,
    });
    blocks.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return blocks;
}

// Render an array of Notion blocks to HTML, grouping consecutive list items.
function blocksToHtml(blocks) {
  let html = "";
  let listType = null; // "ul" | "ol"
  const closeList = () => {
    if (listType) {
      html += `</${listType}>\n`;
      listType = null;
    }
  };

  for (const b of blocks) {
    const t = b.type;
    if (t === "bulleted_list_item" || t === "numbered_list_item") {
      const want = t === "bulleted_list_item" ? "ul" : "ol";
      if (listType !== want) {
        closeList();
        html += `<${want}>\n`;
        listType = want;
      }
      html += `<li>${richText(b[t].rich_text)}</li>\n`;
      continue;
    }
    closeList();

    switch (t) {
      case "heading_1":
        html += `<h2>${richText(b.heading_1.rich_text)}</h2>\n`;
        break;
      case "heading_2":
        html += `<h3>${richText(b.heading_2.rich_text)}</h3>\n`;
        break;
      case "heading_3":
        html += `<h4>${richText(b.heading_3.rich_text)}</h4>\n`;
        break;
      case "paragraph": {
        const inner = richText(b.paragraph.rich_text);
        if (inner.trim()) html += `<p>${inner}</p>\n`;
        break;
      }
      case "code": {
        const lang = esc(b.code.language || "");
        html += `<pre class="code" data-lang="${lang}"><code>${esc(
          plain(b.code.rich_text)
        )}</code></pre>\n`;
        break;
      }
      case "quote":
        html += `<blockquote>${richText(b.quote.rich_text)}</blockquote>\n`;
        break;
      case "callout":
        html += `<div class="callout">${richText(
          b.callout.rich_text
        )}</div>\n`;
        break;
      case "divider":
        html += `<hr/>\n`;
        break;
      case "image": {
        const url = imageUrl(b);
        const cap = plain(b.image.caption);
        if (url)
          html += `<figure><img loading="lazy" src="${esc(url)}" alt="${esc(
            cap || "post image"
          )}"/>${cap ? `<figcaption>${esc(cap)}</figcaption>` : ""}</figure>\n`;
        break;
      }
      case "to_do":
        html += `<p><input type="checkbox" disabled ${
          b.to_do.checked ? "checked" : ""
        }/> ${richText(b.to_do.rich_text)}</p>\n`;
        break;
      default:
        // Unsupported block types are skipped silently.
        break;
    }
  }
  closeList();
  return html;
}

// ---- Page templates ---------------------------------------------------------
const head = (title, desc) => `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc || SITE.tagline)}"/>
<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="stylesheet" href="/assets/styles.css"/>
</head>
<body>`;

const header = `<header class="site-header">
  <a class="brand" href="/">${esc(SITE.name)}<span class="cursor">_</span></a>
  <nav>
    <a href="/">Home</a>
    <a href="/about.html">About</a>
    <a href="${SITE.github}" rel="noopener">GitHub</a>
    <a href="${SITE.linkedin}" rel="noopener">LinkedIn</a>
  </nav>
</header>`;

const footer = `<footer class="site-footer">
  <p>&copy; ${SITE.year} ${esc(SITE.name)} · ${esc(SITE.tagline)}</p>
  <p><a href="mailto:${SITE.email}">${SITE.email}</a> ·
     <a href="${SITE.github}" rel="noopener">GitHub</a> ·
     <a href="${SITE.linkedin}" rel="noopener">LinkedIn</a></p>
  <p class="muted">Content managed in Notion · rebuilt automatically on every change.</p>
</footer>
</body></html>`;

function postCard(p) {
  const tags = p.tags
    .map((t) => `<span class="tag">${esc(t)}</span>`)
    .join("");
  return `<article class="card">
    <a class="card-link" href="/posts/${p.slug}.html">
      <h2>${esc(p.title)}</h2>
      <p class="date">${esc(p.dateLabel)}</p>
      <p class="excerpt">${esc(p.excerpt)}</p>
      <div class="tags">${tags}</div>
    </a>
  </article>`;
}

function indexPage(posts) {
  return `${head(
    `${SITE.name} · ${SITE.tagline}`,
    SITE.intro
  )}
${header}
<main>
  <section class="hero">
    <h1>${esc(SITE.name)}</h1>
    <p class="tagline">${esc(SITE.tagline)}</p>
    <p class="intro">${esc(SITE.intro)}</p>
  </section>
  <section class="posts">
    <h2 class="section-title">Posts</h2>
    <div class="grid">
      ${posts.map(postCard).join("\n")}
    </div>
  </section>
</main>
${footer}`;
}

function postPage(p) {
  const tags = p.tags
    .map((t) => `<span class="tag">${esc(t)}</span>`)
    .join("");
  return `${head(`${p.title} · ${SITE.name}`, p.excerpt)}
${header}
<main class="post">
  <a class="back" href="/">&larr; All posts</a>
  <h1>${esc(p.title)}</h1>
  <p class="date">${esc(p.dateLabel)}</p>
  <div class="tags">${tags}</div>
  <article class="post-body">
    ${p.body}
  </article>
  ${
    p.originalUrl
      ? `<p class="muted">Originally published at <a href="${esc(
          p.originalUrl
        )}" rel="noopener">${esc(p.originalUrl)}</a></p>`
      : ""
  }
</main>
${footer}`;
}

function aboutPage() {
  return `${head(`About · ${SITE.name}`, "About Joshua Krizek")}
${header}
<main class="post">
  <a class="back" href="/">&larr; Home</a>
  <h1>About</h1>
  <article class="post-body">
    <p>Hey! I'm <strong>${esc(
      SITE.name
    )}</strong> — an aspiring ethical hacker.</p>
    <p>This site is where I document what I learn as I work through HackTheBox
       and TCM PEH machines, build out my pentesting toolkit, and write up the
       occasional security story. My focus right now is offensive security and
       the fundamentals of practical ethical hacking.</p>
    <p>Reach me at <a href="mailto:${SITE.email}">${SITE.email}</a>, or find me
       on <a href="${SITE.github}" rel="noopener">GitHub</a> and
       <a href="${SITE.linkedin}" rel="noopener">LinkedIn</a>.</p>
  </article>
</main>
${footer}`;
}

// ---- Main -------------------------------------------------------------------
async function queryPublishedPosts() {
  const pages = [];
  let cursor;
  do {
    const res = await notion.databases.query({
      database_id: DATABASE_ID,
      start_cursor: cursor,
      page_size: 100,
      filter: { property: "Status", select: { equals: "Published" } },
      sorts: [{ property: "Publish Date", direction: "descending" }],
    });
    pages.push(...res.results);
    cursor = res.has_more ? res.next_cursor : undefined;
  } while (cursor);
  return pages;
}

function readProps(page) {
  const props = page.properties || {};
  const title = plain(props.Title?.title) || "Untitled";
  const slug = plain(props.Slug?.rich_text) || slugify(title);
  const excerpt = plain(props.Excerpt?.rich_text) || "";
  const originalUrl = props["Original URL"]?.url || "";
  const tags = (props.Tags?.multi_select || []).map((t) => t.name);
  const dateRaw = props["Publish Date"]?.date?.start || null;
  const dateLabel = dateRaw
    ? new Date(dateRaw).toLocaleDateString("en-US", {
        year: "numeric",
        month: "long",
        day: "numeric",
        timeZone: "UTC",
      })
    : "";
  return { title, slug, excerpt, originalUrl, tags, dateRaw, dateLabel };
}

async function main() {
  if (!NOTION_TOKEN) {
    console.error(
      "ERROR: NOTION_TOKEN env var is required.\n" +
        "Create an internal integration at https://www.notion.so/my-integrations,\n" +
        "share the Blog Posts database with it, then set NOTION_TOKEN."
    );
    process.exit(1);
  }
  const { Client } = await import("@notionhq/client");
  notion = new Client({ auth: NOTION_TOKEN, notionVersion: "2022-06-28" });
  console.log("Fetching posts from Notion…");
  const pages = await queryPublishedPosts();
  console.log(`Found ${pages.length} published post(s).`);

  const posts = [];
  for (const page of pages) {
    const meta = readProps(page);
    const blocks = await fetchBlocks(page.id);
    const body = blocksToHtml(blocks);
    posts.push({ ...meta, body });
    console.log(`  • ${meta.title} (${meta.slug})`);
  }

  // Clean + recreate dist
  if (existsSync(DIST)) await rm(DIST, { recursive: true, force: true });
  await mkdir(path.join(DIST, "posts"), { recursive: true });
  await mkdir(path.join(DIST, "assets"), { recursive: true });

  // Assets
  await cp(
    path.join(ROOT, "src", "styles.css"),
    path.join(DIST, "assets", "styles.css")
  );
  // GitHub Pages: don't run Jekyll, and ship the custom domain.
  await writeFile(path.join(DIST, ".nojekyll"), "");
  if (existsSync(path.join(ROOT, "CNAME"))) {
    await cp(path.join(ROOT, "CNAME"), path.join(DIST, "CNAME"));
  }

  // Pages
  await writeFile(path.join(DIST, "index.html"), indexPage(posts));
  await writeFile(path.join(DIST, "about.html"), aboutPage());
  for (const p of posts) {
    await writeFile(path.join(DIST, "posts", `${p.slug}.html`), postPage(p));
  }

  console.log(`\nBuilt ${posts.length + 2} pages into ./dist`);
}

// Render helpers are exported so the build can be unit-tested without Notion.
export { blocksToHtml, richText, indexPage, postPage, aboutPage, readProps, slugify };

// Only hit the Notion API when run directly (node scripts/build.mjs).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
