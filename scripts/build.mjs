// Build script: pulls the "Blog Posts" database from Notion and renders a
// static site into ./dist. Run with: NOTION_TOKEN=secret_xxx npm run build
//
// You edit posts in Notion; GitHub Actions re-runs this build and redeploys.

import { mkdir, writeFile, cp, rm } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
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
  tagline: "Cybersecurity and IT professional",
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

// Inline the stylesheet so pages never depend on a separately-served asset.
const CSS = readFileSync(path.join(ROOT, "src", "styles.css"), "utf8");

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
  // Recurse into nested blocks (columns, toggles, …) so their content renders.
  for (const b of blocks) {
    if (b.has_children) b.children = await fetchBlocks(b.id);
  }
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
        const language = (b.code.language || "").toLowerCase();
        const raw = plain(b.code.rich_text);
        if (language === "mermaid") {
          // Rendered client-side by Mermaid.js (see mermaidScript below).
          html += `<pre class="mermaid">${esc(raw)}</pre>\n`;
        } else {
          html += `<pre class="code" data-lang="${esc(
            language
          )}"><code>${esc(raw)}</code></pre>\n`;
        }
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
      case "column_list":
        html += `<div class="columns">${(b.children || [])
          .map((col) => `<div class="col">${blocksToHtml(col.children || [])}</div>`)
          .join("")}</div>\n`;
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
<style>${CSS}</style>
</head>
<body>`;

const header = `<header class="site-header">
  <a class="brand" href="/">${esc(SITE.name)}<span class="cursor">_</span></a>
  <nav>
    <a href="/">Home</a>
    <a href="/services.html">Services</a>
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

// Loaded only on pages that contain a Mermaid diagram.
const mermaidScript = `<script type="module">
import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
mermaid.initialize({ startOnLoad: true, theme: "dark", securityLevel: "loose" });
</script>`;

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
${p.body.includes('class="mermaid"') ? mermaidScript : ""}
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
    )}</strong> — a cybersecurity and IT professional.</p>
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

function servicesPage() {
  const svc = (title, desc) =>
    `<div class="card"><div class="svc"><h3>${title}</h3><p>${desc}</p></div></div>`;
  return `${head(
    `Services · ${SITE.name}`,
    "Offensive and defensive security services — penetration testing (external, internal, physical) and blue team assessments and consulting."
  )}
${header}
<main class="post services">
  <a class="back" href="/">&larr; Home</a>
  <h1>Services</h1>
  <p class="intro">Offensive and defensive security work for organizations that want to find their weak spots before someone else does. Every engagement starts with a scoping conversation and ends with a clear, prioritized report — what's exposed, how it was exploited, and exactly how to fix it.</p>

  <h2 class="section-title">Penetration Testing</h2>
  <div class="grid">
    ${svc(
      "External Penetration Testing",
      "A remote attacker's view of your internet-facing footprint — perimeter services, web apps, email, VPNs, and exposed assets. I map the ways in from the outside and demonstrate real-world impact."
    )}
    ${svc(
      "Internal Penetration Testing",
      "Assumed-breach testing from inside the network: privilege escalation, lateral movement, Active Directory attacks, and the path from a single foothold to full domain compromise."
    )}
    ${svc(
      "Physical Penetration Testing",
      "On-site assessment of your physical controls — badge cloning, tailgating, lock bypass, and social engineering — to see how far someone could get past the front door."
    )}
  </div>

  <h2 class="section-title">Blue Team &amp; Consulting</h2>
  <div class="grid">
    ${svc(
      "Blue Team Security Assessments",
      "A defender-focused review of your detection and response: logging and visibility, alerting, endpoint and network hardening, and how your controls hold up against real attacker techniques (mapped to MITRE ATT&amp;CK)."
    )}
    ${svc(
      "Security Consulting",
      "Advisory work to build and mature your security program — risk assessments, remediation roadmaps, architecture and policy review, and guidance you can actually act on."
    )}
  </div>

  <div class="callout cta">
    <p><strong>Ready to talk scope?</strong> Engagements are tailored to your environment, goals, and rules of engagement.</p>
    <a class="btn" href="mailto:${SITE.email}?subject=Security%20services%20inquiry">Get in touch &rarr;</a>
  </div>
</main>
${footer}`;
}

// Notion-hosted images (uploaded straight into a post) are served from
// temporary signed URLs that expire within ~an hour, so embedding them in a
// static site breaks fast. Download them at build time and serve them from the
// site instead. Images added by external URL (GitHub, giphy, …) are left alone.
const MAX_IMAGE_WIDTH = 1600;
const EXT_BY_TYPE = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/jpg": "jpg",
  "image/gif": "gif",
  "image/webp": "webp",
  "image/svg+xml": "svg",
  "image/avif": "avif",
  "image/bmp": "bmp",
};

function guessExt(contentType, url) {
  const ct = (contentType || "").split(";")[0].trim().toLowerCase();
  if (EXT_BY_TYPE[ct]) return EXT_BY_TYPE[ct];
  const m = (url || "").split("?")[0].match(/\.([a-z0-9]{2,5})$/i);
  return m ? m[1].toLowerCase() : "png";
}

async function localizeImages(blocks, slug, counter = { n: 0 }) {
  for (const b of blocks) {
    if (b.type === "image" && b.image?.type === "file" && b.image.file?.url) {
      const src = b.image.file.url;
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        let buf = Buffer.from(await res.arrayBuffer());
        let ext = guessExt(res.headers.get("content-type"), src);
        // Browsers can't display HEIC/HEIF (common from iPhones) — convert to JPEG.
        if (ext === "heic" || ext === "heif") {
          const heicConvert = (await import("heic-convert")).default;
          buf = Buffer.from(
            await heicConvert({ buffer: buf, format: "JPEG", quality: 0.9 })
          );
          ext = "jpg";
        }
        // Downscale oversized photos, re-compress, and strip EXIF/GPS metadata.
        if (["jpg", "png", "webp"].includes(ext)) {
          try {
            const sharp = (await import("sharp")).default;
            let img = sharp(buf, { failOn: "none" }).rotate();
            const meta = await img.metadata();
            if (meta.width && meta.width > MAX_IMAGE_WIDTH) {
              img = img.resize({ width: MAX_IMAGE_WIDTH });
            }
            if (ext === "jpg") img = img.jpeg({ quality: 82, mozjpeg: true });
            else if (ext === "png") img = img.png({ compressionLevel: 9 });
            else img = img.webp({ quality: 82 });
            buf = await img.toBuffer();
          } catch (err) {
            console.warn(`    ! image optimize skipped: ${err.message}`);
          }
        }
        const name = `${slug}-${++counter.n}.${ext}`;
        await writeFile(path.join(DIST, "images", name), buf);
        // Rewrite the block so blocksToHtml emits a stable, self-hosted path.
        b.image = {
          type: "external",
          external: { url: `/images/${name}` },
          caption: b.image.caption || [],
        };
        console.log(`    \u21b3 saved image /images/${name}`);
      } catch (err) {
        console.warn(`    ! could not fetch a Notion image for ${slug}: ${err.message}`);
      }
    }
    // Recurse into nested content (e.g. images inside column layouts).
    if (b.children) await localizeImages(b.children, slug, counter);
  }
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

  // Clean + recreate dist up front so images can be downloaded into it.
  if (existsSync(DIST)) await rm(DIST, { recursive: true, force: true });
  await mkdir(path.join(DIST, "posts"), { recursive: true });
  await mkdir(path.join(DIST, "assets"), { recursive: true });
  await mkdir(path.join(DIST, "images"), { recursive: true });

  const posts = [];
  for (const page of pages) {
    const meta = readProps(page);
    const blocks = await fetchBlocks(page.id);
    await localizeImages(blocks, meta.slug);
    const body = blocksToHtml(blocks);
    posts.push({ ...meta, body });
    console.log(`  \u2022 ${meta.title} (${meta.slug})`);
  }

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
  await writeFile(path.join(DIST, "services.html"), servicesPage());
  for (const p of posts) {
    await writeFile(path.join(DIST, "posts", `${p.slug}.html`), postPage(p));
  }

  console.log(`\nBuilt ${posts.length + 2} pages into ./dist`);
}

// Render helpers are exported so the build can be unit-tested without Notion.
export { blocksToHtml, richText, indexPage, postPage, aboutPage, servicesPage, readProps, slugify, localizeImages, guessExt };

// Only hit the Notion API when run directly (node scripts/build.mjs).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
