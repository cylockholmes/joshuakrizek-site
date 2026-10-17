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
  url: "https://joshuakrizek.com",
  tagline: "Penetration Tester · Offensive Security",
  intro:
    "Security researcher on the Synack Red Team, testing commercial and federal web apps and hosts. PNPT, GWAPT, GCIH, GSEC, Security+. 1st place (solo) in the siberX & SANS Core NetWars CTF at Black Hat USA 2026. Here you'll find my tools, write-ups, and walkthroughs.",
  openTo:
    "Open to mid-level offensive security, AppSec, and security engineering roles — US (remote or onsite) and Canada.",
  email: "hello@joshuakrizek.com",
  github: "https://github.com/cylockholmes/",
  linkedin: "https://www.linkedin.com/in/joshua-krizek/",
  certs: [
    { code: "PNPT", name: "Practical Network Penetration Tester", note: "TCM Security · 2026" },
    { code: "GWAPT", name: "GIAC Web Application Penetration Tester", note: "Active through 2030" },
    { code: "GCIH", name: "GIAC Certified Incident Handler", note: "Active through 2030" },
    { code: "GSEC", name: "GIAC Security Essentials", note: "Active through 2029" },
    { code: "Sec+", name: "CompTIA Security+", note: "2026" },
    { code: "eJPT", name: "eLearnSecurity Junior Penetration Tester", note: "2021" },
  ],
  // Resume page data. Levels are out of 10 segments (self-assessed, weighted
  // by certs and paid work rather than coursework).
  skills: [
    { name: "Web app pentesting", level: 9, proof: "GWAPT · Synack Red Team missions" },
    { name: "Network & AD attacks", level: 8, proof: "PNPT · eJPT · AD admin at Hudbay" },
    { name: "Recon & OSINT", level: 8, proof: "Trace Labs top 6 · built assay" },
    { name: "Findings & reporting", level: 8, proof: "Repro steps, impact, remediation" },
    { name: "Adversary emulation", level: 7, proof: "Sliver C2 demo at Centripetal" },
    { name: "Python tooling", level: 7, proof: "assay · recon-search" },
    { name: "Incident handling", level: 6, proof: "GCIH · threat intel reporting" },
    { name: "Crypto & reversing", level: 6, proof: "NetWars crypto · NCL coaching" },
  ],
  tools: ["Burp Suite", "Sliver C2", "Splunk", "Wireshark", "Active Directory", "pfSense", "VMware", "Python", "Kotlin", "Linux", "Windows Server"],
  experience: [
    {
      role: "Security Researcher (Contract)",
      org: "Synack Red Team",
      when: "Feb 2026 – now",
      what: "Paid offensive security missions against commercial and federal web apps and hosts. Every finding ships with reproduction steps, impact analysis, and a fix.",
    },
    {
      role: "Executive Officer",
      org: "La Roca Ministries",
      when: "Apr 2024 – Jun 2025",
      what: "Led a binational nonprofit through a governance and compliance overhaul; ran its website, donor and finance integrations.",
    },
    {
      role: "Intelligence Operations Analyst",
      org: "Centripetal Networks",
      when: "Mar 2023 – Jan 2024",
      what: "Built a Sliver C2 adversary-emulation demo for the product, analyzed attacker infrastructure across 15+ enterprise customers, and built Splunk dashboards for executives.",
    },
    {
      role: "IT Specialist",
      org: "Hudbay Minerals",
      when: "Jun 2021 – Feb 2023",
      what: "Ran Active Directory access across four US sites with least privilege, and caught and remediated IT security policy violations.",
    },
    {
      role: "Sub Coach, National Cyber League",
      org: "University of Arizona CyberCats",
      when: "2021",
      what: "Taught exploitation, reverse engineering, and OWASP Top 10 sessions to a 20-person collegiate team.",
    },
    {
      role: "Owner",
      org: "PiggyBank Bargains LLC",
      when: "Jan 2018 – Aug 2022",
      what: "Founded and ran a small business for 4+ years with a team of 7; wrote the SOPs that let it scale.",
    },
  ],
  // CTF placements, best first. "of" is the field size.
  scores: [
    { rank: "1st", of: "solo", event: "siberX & SANS Core NetWars CTF", year: "2026", where: "Black Hat USA" },
    { rank: "1st", of: "7 teams", event: "US Cyber Challenge Eastern Camp CTF", year: "2019", where: "Full scholarship" },
    { rank: "6th", of: "243", event: "Trace Labs Missing Persons OSINT CTF", year: "", where: "Team" },
    { rank: "10th", of: "195", event: "Cipher Tech Forensics", year: "", where: "Solo · 100% complete" },
    { rank: "13th", of: "925", event: "National Cyber League", year: "2020", where: "Arizona Pentesting Team" },
    { rank: "17th", of: "119", event: "CyberSEED", year: "2022", where: "Team" },
    { rank: "26th", of: "5,379", event: "National Cyber League preseason", year: "2020", where: "Solo" },
    { rank: "35th", of: "1,173", event: "Cyber FastTrack", year: "2020", where: "Solo · SANS scholarship" },
  ],
  education: [
    { degree: "M.S. Cybersecurity and Information Assurance", school: "Western Governors University", when: "In progress" },
    { degree: "Undergraduate Certificate in Applied Cyber Security", school: "SANS Technology Institute", when: "2022" },
    { degree: "B.S. Business Administration, Computer Information Systems", school: "Thomas Edison State University", when: "2019" },
  ],
  projects: [
    {
      name: "assay",
      url: "https://github.com/cylockholmes/assay",
      lang: "Python",
      desc: "Recon and triage for authorized offensive testing — signal over volume.",
    },
    {
      name: "burp-id-switcher",
      url: "https://github.com/cylockholmes/burp-id-switcher",
      lang: "Kotlin",
      desc: "Burp Suite extension: mark parameters in Repeater and swap them against other test accounts' values for fast IDOR testing.",
    },
    {
      name: "recon-search",
      url: "https://github.com/cylockholmes/recon-search",
      lang: "Tooling",
      desc: "Self-contained search across recon notes in bug bounty target folders.",
    },
  ],
  year: new Date().getFullYear(),
};

// Notion client is created lazily in main() so the render helpers can be
// imported and tested without the @notionhq/client dependency installed.
let notion;

// Inline the stylesheet so pages never depend on a separately-served asset.
const CSS = readFileSync(path.join(ROOT, "src", "styles.css"), "utf8");
// The resume page layers its own arcade theme on top of the site styles.
const RESUME_CSS = readFileSync(path.join(ROOT, "src", "resume.css"), "utf8");

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
// JSON-LD for the site owner. Embedded on the homepage and About page, and
// referenced as the author of every post.
const person = () => ({
  "@type": "Person",
  name: SITE.name,
  jobTitle: "Penetration Tester",
  url: SITE.url,
  email: `mailto:${SITE.email}`,
  sameAs: [SITE.github.replace(/\/$/, ""), SITE.linkedin.replace(/\/$/, "")],
  alumniOf: SITE.education.map((e) => ({ "@type": "EducationalOrganization", name: e.school })),
  knowsAbout: ["Penetration testing", "Web application security", "Active Directory", "Bug bounty"],
});

// Keep "</script>" out of inline JSON so post titles can't break out of the tag.
const jsonLd = (obj) =>
  `<script type="application/ld+json">${JSON.stringify({
    "@context": "https://schema.org",
    ...obj,
  }).replace(/</g, "\\u003c")}</script>`;

// path is site-relative ("/about.html"); used for canonical + og:url.
const head = ({ title, desc, path: pagePath = "/", type = "website", schema = null, noindex = false, extraHead = "", bodyClass = "" }) => {
  const description = desc || SITE.tagline;
  const url = SITE.url + pagePath;
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}"/>
<meta name="author" content="${esc(SITE.name)}"/>
${noindex ? `<meta name="robots" content="noindex"/>` : `<link rel="canonical" href="${esc(url)}"/>`}
<meta property="og:site_name" content="${esc(SITE.name)}"/>
<meta property="og:type" content="${type}"/>
<meta property="og:title" content="${esc(title)}"/>
<meta property="og:description" content="${esc(description)}"/>
<meta property="og:url" content="${esc(url)}"/>
<meta property="og:image" content="${SITE.url}/og.png"/>
<meta property="og:image:width" content="1200"/>
<meta property="og:image:height" content="630"/>
<meta name="twitter:card" content="summary_large_image"/>
<meta name="twitter:title" content="${esc(title)}"/>
<meta name="twitter:description" content="${esc(description)}"/>
<meta name="twitter:image" content="${SITE.url}/og.png"/>
<meta name="theme-color" content="#0b0f0d"/>
<link rel="icon" href="/favicon.svg" type="image/svg+xml"/>
<link rel="alternate" type="application/rss+xml" title="${esc(SITE.name)}" href="/feed.xml"/>
${schema ? jsonLd(schema) : ""}
<style>${CSS}</style>
${extraHead}
</head>
<body${bodyClass ? ` class="${bodyClass}"` : ""}>`;
};

const header = `<header class="site-header">
  <a class="brand" href="/">${esc(SITE.name)}<span class="cursor">_</span></a>
  <nav>
    <a href="/">Home</a>
    <a href="/#projects">Projects</a>
    <a href="/resume.html">Resume</a>
    <a href="/about.html">About</a>
    <a href="/services.html">Services</a>
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

function projectsSection() {
  const card = (p) => `<article class="card">
      <a class="card-link" href="${esc(p.url)}" rel="noopener">
        <h3>${esc(p.name)}</h3>
        <p class="excerpt">${esc(p.desc)}</p>
        <div class="tags"><span class="tag">${esc(p.lang)}</span></div>
      </a>
    </article>`;
  return `<section class="projects" id="projects">
    <h2 class="section-title">Projects</h2>
    <div class="grid">
      ${SITE.projects.map(card).join("\n")}
    </div>
  </section>`;
}

const ctaRow = `<div class="cta-row">
      <a class="btn" href="mailto:${SITE.email}">Email me</a>
      <a class="btn btn-ghost" href="/resume.html">Resume</a>
      <a class="btn btn-ghost" href="${SITE.linkedin}" rel="noopener">LinkedIn</a>
      <a class="btn btn-ghost" href="${SITE.github}" rel="noopener">GitHub</a>
    </div>`;

function indexPage(posts) {
  return `${head({
    title: `${SITE.name} · ${SITE.tagline}`,
    desc: SITE.intro,
    path: "/",
    schema: {
      "@type": "ProfilePage",
      mainEntity: person(),
    },
  })}
${header}
<main>
  <section class="hero">
    <h1>${esc(SITE.name)}</h1>
    <p class="tagline">${esc(SITE.tagline)}</p>
    <p class="intro">${esc(SITE.intro)}</p>
    <p class="open-to">${esc(SITE.openTo)}</p>
    ${ctaRow}
  </section>
  ${projectsSection()}
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
  return `${head({
    title: `${p.title} · ${SITE.name}`,
    desc: p.excerpt,
    path: `/posts/${p.slug}.html`,
    type: "article",
    schema: {
      "@type": "BlogPosting",
      headline: p.title,
      description: p.excerpt || undefined,
      datePublished: p.dateRaw || undefined,
      keywords: p.tags.join(", ") || undefined,
      url: `${SITE.url}/posts/${p.slug}.html`,
      author: { "@type": "Person", name: SITE.name, url: SITE.url },
    },
  })}
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
  return `${head({
    title: `About · ${SITE.name}`,
    desc: `${SITE.name} — penetration tester on the Synack Red Team. Certifications, experience, and education.`,
    path: "/about.html",
    type: "profile",
    schema: { "@type": "AboutPage", mainEntity: person() },
  })}
${header}
<main class="post">
  <a class="back" href="/">&larr; Home</a>
  <h1>About</h1>
  <article class="post-body">
    <p>I'm <strong>${esc(SITE.name)}</strong>, a penetration tester based in
       Tucson, Arizona. I run paid offensive security missions as a contract
       Security Researcher on the <strong>Synack Red Team</strong>, testing
       commercial and federal web applications and hosts and writing up each
       finding with reproduction steps, impact, and remediation guidance.</p>
    <p>Before that I was an Intelligence Operations Analyst at Centripetal
       Networks, where I built a Sliver C2 adversary-emulation demo and analyzed
       attacker infrastructure across 15+ enterprise customer environments, and an
       IT Specialist at Hudbay Minerals managing Active Directory across four US
       sites. That defender-side background shapes how I test and how I write
       remediation advice people can actually act on.</p>
    <p>I compete in CTFs whenever I can — most recently taking <strong>1st place
       (solo)</strong> in the siberX &amp; SANS Core NetWars CTF at Black Hat USA
       2026 — and I've coached the University of Arizona CyberCats on
       exploitation, reverse engineering, and the OWASP Top 10.</p>

    <h2>Certifications</h2>
    <ul>
      ${SITE.certs.map((c) => `<li>${esc(c.code)} — ${esc(c.name)} (${esc(c.note)})</li>`).join("\n      ")}
    </ul>

    <h2>Education</h2>
    <ul>
      ${SITE.education
        .map((e) => `<li><strong>${esc(e.degree)}</strong> — ${esc(e.school)} (${esc(e.when)})</li>`)
        .join("\n      ")}
    </ul>

    <h2>Get in touch</h2>
    <p>${esc(SITE.openTo)} My resume is available on request.</p>
  </article>
  ${ctaRow}
</main>
${footer}`;
}

// The resume, styled as an 80s arcade cabinet: skills are power meters, certs
// are inventory cartridges, jobs are stages, CTF placements are high scores.
function resumePage() {
  const meter = (level) =>
    `<span class="meter" role="img" aria-label="${level} out of 10">${Array.from(
      { length: 10 },
      (_, i) => `<i${i < level ? ' class="on"' : ""}></i>`
    ).join("")}</span>`;

  const stats = SITE.skills
    .map(
      (s) => `<li>
          <span class="stat-name">${esc(s.name)}</span>
          ${meter(s.level)}
          <span class="stat-proof">${esc(s.proof)}</span>
        </li>`
    )
    .join("\n        ");

  const carts = SITE.certs
    .map(
      (c) => `<li class="cart">
          <span class="cart-label">${esc(c.code)}</span>
          <span class="cart-name">${esc(c.name)}</span>
          <span class="cart-note">${esc(c.note)}</span>
        </li>`
    )
    .join("\n        ");

  const n = SITE.experience.length;
  const stages = SITE.experience
    .map(
      (e, i) => `<li class="stage${i === 0 ? " current" : ""}">
          <span class="stage-no">Stage ${n - i}</span>
          <div class="stage-body">
            <h3>${esc(e.role)}</h3>
            <p class="stage-org">${esc(e.org)} <span>${esc(e.when)}</span></p>
            <p>${esc(e.what)}</p>
          </div>
        </li>`
    )
    .join("\n        ");

  const scores = SITE.scores
    .map(
      (s, i) => `<tr${i === 0 ? ' class="top"' : ""}>
            <td class="rank">${esc(s.rank)}</td>
            <td class="of">of ${esc(s.of)}</td>
            <td class="event">${esc(s.event)}<span>${esc([s.where, s.year].filter(Boolean).join(", "))}</span></td>
          </tr>`
    )
    .join("\n          ");

  const saves = SITE.education
    .map(
      (e, i) => `<li><span class="slot">Slot ${i + 1}</span><strong>${esc(e.degree)}</strong><span>${esc(e.school)} · ${esc(e.when)}</span></li>`
    )
    .join("\n        ");

  return `${head({
    title: `Resume · ${SITE.name}`,
    desc: `${SITE.name} — penetration tester. Skills, certifications, experience, and CTF results.`,
    path: "/resume.html",
    type: "profile",
    schema: { "@type": "ProfilePage", mainEntity: person() },
    bodyClass: "arcade-page",
    extraHead: `<link rel="preconnect" href="https://fonts.googleapis.com"/>
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin/>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Press+Start+2P&family=VT323&display=swap"/>
<style>${RESUME_CSS}</style>`,
  })}
${header}
<main class="arcade">
  <section class="title-screen" aria-labelledby="resume-title">
    <div class="horizon" aria-hidden="true"><div class="sun"></div><div class="floor"></div></div>
    <div class="title-copy">
      <p class="p1">Player 1</p>
      <h1 id="resume-title" class="logo"><span>Joshua</span><span>Krizek</span></h1>
      <p class="class-line">Class: Penetration Tester</p>
      <p class="hi">Hi-score: 1st place, Black Hat USA 2026</p>
      <a class="press-start" href="mailto:${SITE.email}?subject=Let%27s%20talk">Press start to email me</a>
    </div>
  </section>

  <section class="panel" aria-labelledby="stats-h">
    <h2 id="stats-h">Player stats</h2>
    <ul class="stats">
        ${stats}
    </ul>
  </section>

  <section class="panel" aria-labelledby="inv-h">
    <h2 id="inv-h">Inventory</h2>
    <ul class="carts">
        ${carts}
    </ul>
    <p class="equipped-label">Equipped</p>
    <ul class="equipped">
      ${SITE.tools.map((t) => `<li>${esc(t)}</li>`).join("")}
    </ul>
  </section>

  <section class="panel" aria-labelledby="stages-h">
    <h2 id="stages-h">Stage select</h2>
    <ol class="stages">
        ${stages}
    </ol>
  </section>

  <section class="panel" aria-labelledby="scores-h">
    <h2 id="scores-h">High scores</h2>
    <table class="scores">
      <thead><tr><th scope="col">Rank</th><th scope="col">Field</th><th scope="col">Event</th></tr></thead>
      <tbody>
          ${scores}
      </tbody>
    </table>
  </section>

  <section class="panel" aria-labelledby="saves-h">
    <h2 id="saves-h">Save files</h2>
    <ul class="saves">
        ${saves}
    </ul>
  </section>

  <section class="continue" aria-labelledby="continue-h">
    <h2 id="continue-h">Continue?</h2>
    <p>${esc(SITE.openTo)} A printable PDF resume is available on request.</p>
    <div class="continue-row">
      <a class="arcade-btn" href="mailto:${SITE.email}">Email</a>
      <a class="arcade-btn alt" href="${SITE.linkedin}" rel="noopener">LinkedIn</a>
      <a class="arcade-btn alt" href="${SITE.github}" rel="noopener">GitHub</a>
    </div>
  </section>
</main>
${footer}`;
}

function notFoundPage() {
  return `${head({ title: `Not found · ${SITE.name}`, desc: "Page not found.", path: "/404.html", noindex: true })}
${header}
<main class="post">
  <h1>404</h1>
  <p class="intro">That page doesn't exist — maybe it moved when the blog was migrated.</p>
  <p><a href="/">&larr; Back to the homepage</a></p>
</main>
${footer}`;
}

// ---- Feeds ------------------------------------------------------------------
const xmlEsc = (s = "") =>
  String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");

function sitemapXml(posts) {
  const urls = [
    { loc: "/" },
    { loc: "/resume.html" },
    { loc: "/about.html" },
    { loc: "/services.html" },
    ...posts.map((p) => ({ loc: `/posts/${p.slug}.html`, lastmod: p.dateRaw })),
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls
  .map(
    (u) =>
      `  <url><loc>${xmlEsc(SITE.url + u.loc)}</loc>${
        u.lastmod ? `<lastmod>${xmlEsc(u.lastmod.slice(0, 10))}</lastmod>` : ""
      }</url>`
  )
  .join("\n")}
</urlset>
`;
}

function rssXml(posts) {
  const items = posts
    .map((p) => {
      const link = `${SITE.url}/posts/${p.slug}.html`;
      return `  <item>
    <title>${xmlEsc(p.title)}</title>
    <link>${xmlEsc(link)}</link>
    <guid isPermaLink="true">${xmlEsc(link)}</guid>${
      p.dateRaw ? `\n    <pubDate>${new Date(p.dateRaw).toUTCString()}</pubDate>` : ""
    }
    <description>${xmlEsc(p.excerpt)}</description>
${p.tags.map((t) => `    <category>${xmlEsc(t)}</category>`).join("\n")}
  </item>`;
    })
    .join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
<channel>
  <title>${xmlEsc(SITE.name)}</title>
  <link>${SITE.url}/</link>
  <description>${xmlEsc(SITE.intro)}</description>
  <language>en-us</language>
  <atom:link href="${SITE.url}/feed.xml" rel="self" type="application/rss+xml"/>
${items}
</channel>
</rss>
`;
}

const robotsTxt = () => `User-agent: *
Allow: /

Sitemap: ${SITE.url}/sitemap.xml
`;

function servicesPage() {
  const svc = (title, desc) =>
    `<div class="card"><div class="svc"><h3>${title}</h3><p>${desc}</p></div></div>`;
  return `${head({
    title: `Services · ${SITE.name}`,
    desc: "Offensive and defensive security services — penetration testing (external, internal, physical) and blue team assessments and consulting.",
    path: "/services.html",
  })}
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
  // Social preview card + favicon (og.png is generated by scripts/make-og.mjs).
  for (const f of ["og.png", "favicon.svg"]) {
    await cp(path.join(ROOT, "src", f), path.join(DIST, f));
  }

  // Pages
  await writeFile(path.join(DIST, "index.html"), indexPage(posts));
  await writeFile(path.join(DIST, "about.html"), aboutPage());
  await writeFile(path.join(DIST, "resume.html"), resumePage());
  await writeFile(path.join(DIST, "services.html"), servicesPage());
  await writeFile(path.join(DIST, "404.html"), notFoundPage());
  for (const p of posts) {
    await writeFile(path.join(DIST, "posts", `${p.slug}.html`), postPage(p));
  }

  // Discovery: sitemap, robots, RSS
  await writeFile(path.join(DIST, "sitemap.xml"), sitemapXml(posts));
  await writeFile(path.join(DIST, "robots.txt"), robotsTxt());
  await writeFile(path.join(DIST, "feed.xml"), rssXml(posts));

  console.log(`\nBuilt ${posts.length + 5} pages into ./dist`);
}

// Render helpers are exported so the build can be unit-tested without Notion.
export { SITE, blocksToHtml, richText, indexPage, postPage, aboutPage, resumePage, servicesPage, notFoundPage, sitemapXml, rssXml, robotsTxt, readProps, slugify, localizeImages, guessExt };

// Only hit the Notion API when run directly (node scripts/build.mjs).
const invokedDirectly =
  process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (invokedDirectly) {
  main().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
