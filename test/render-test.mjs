// Offline render test — no Notion token needed.
// Feeds mock blocks/props through the real render helpers and writes a
// preview into ./dist-preview so the HTML/CSS can be eyeballed.
import { mkdir, writeFile, cp, rm } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  blocksToHtml,
  indexPage,
  postPage,
  aboutPage,
  resumePage,
  servicesPage,
  notFoundPage,
  sitemapXml,
  rssXml,
  robotsTxt,
} from "../scripts/build.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const OUT = path.join(ROOT, "dist-preview");

const rt = (text, ann = {}, href = null) => ({
  plain_text: text,
  annotations: { bold: false, italic: false, code: false, strikethrough: false, underline: false, ...ann },
  href,
});

const mockBlocks = [
  { type: "heading_1", heading_1: { rich_text: [rt("Academy - TCM - PEH")] } },
  { type: "paragraph", paragraph: { rich_text: [rt("The first step is to scan the host with "), rt("nmap", { code: true }), rt(":")] } },
  { type: "code", code: { language: "bash", rich_text: [rt("nmap -p- -T4 -A {ip.address}")] } },
  { type: "image", image: { type: "external", external: { url: "https://raw.githubusercontent.com/cylockholmes/cylockholmes.github.io/master/Academy/image.png" }, caption: [rt("Nmap scan results")] } },
  { type: "paragraph", paragraph: { rich_text: [rt("We found three open ports. See "), rt("CrackStation", {}, "https://crackstation.net/"), rt(" for cracking hashes.")] } },
  { type: "bulleted_list_item", bulleted_list_item: { rich_text: [rt("Port 21 — vsftpd 3.0.3")] } },
  { type: "bulleted_list_item", bulleted_list_item: { rich_text: [rt("Port 80 — Apache 2.4.38")] } },
  { type: "quote", quote: { rich_text: [rt("Always verify your exploit doesn't cause unintended harm.")] } },
  { type: "divider", divider: {} },
];

const post = {
  title: "Academy",
  slug: "academy",
  excerpt: "TCM PEH Academy box — FTP creds, PHP reverse shell, linPEAS, cronjob privesc.",
  originalUrl: "https://joshuakrizek.com/posts/academy/",
  tags: ["PEH", "Walkthrough"],
  dateRaw: "2025-07-15",
  dateLabel: "July 15, 2025",
  body: blocksToHtml(mockBlocks),
};

const posts = [
  post,
  { title: "Blue", slug: "blue", excerpt: "Exploiting the PEH machine Blue via EternalBlue.", originalUrl: "", tags: ["PEH", "Walkthrough"], dateRaw: "2025-07-07", dateLabel: "July 7, 2025", body: "<p>Sample.</p>" },
];

if (existsSync(OUT)) await rm(OUT, { recursive: true, force: true });
await mkdir(path.join(OUT, "posts"), { recursive: true });
await mkdir(path.join(OUT, "assets"), { recursive: true });
await cp(path.join(ROOT, "src", "styles.css"), path.join(OUT, "assets", "styles.css"));
await writeFile(path.join(OUT, "index.html"), indexPage(posts));
await writeFile(path.join(OUT, "about.html"), aboutPage());
await writeFile(path.join(OUT, "resume.html"), resumePage());
await writeFile(path.join(OUT, "services.html"), servicesPage());
await writeFile(path.join(OUT, "404.html"), notFoundPage());
await writeFile(path.join(OUT, "posts", "academy.html"), postPage(post));
await writeFile(path.join(OUT, "sitemap.xml"), sitemapXml(posts));
await writeFile(path.join(OUT, "feed.xml"), rssXml(posts));
await writeFile(path.join(OUT, "robots.txt"), robotsTxt());
for (const f of ["og.png", "favicon.svg"]) await cp(path.join(ROOT, "src", f), path.join(OUT, f));

// Assertions
const html = postPage(post);
const checks = [
  ["renders post title", html.includes("<h1>Academy</h1>")],
  ["renders code block", html.includes('<pre class="code" data-lang="bash"')],
  ["renders image", html.includes("Academy/image.png")],
  ["renders inline code", html.includes("<code>nmap</code>")],
  ["renders link", html.includes('href="https://crackstation.net/"')],
  ["renders list", html.includes("<ul>") && html.includes("<li>Port 21")],
  ["renders tags", html.includes('class="tag">PEH')],
  ["index lists both posts", indexPage(posts).includes("Academy") && indexPage(posts).includes("Blue")],
  ["index has projects section", indexPage(posts).includes('id="projects"') && indexPage(posts).includes("burp-id-switcher")],
  ["about lists certs", aboutPage().includes("GWAPT") && aboutPage().includes("Synack")],
  ["404 is noindex", notFoundPage().includes('content="noindex"') && !notFoundPage().includes('rel="canonical"')],
  ["sitemap lists posts", sitemapXml(posts).includes("/posts/academy.html</loc><lastmod>2025-07-15")],
  ["rss has items", (rssXml(posts).match(/<item>/g) || []).length === 2],
  ["resume has all windows", ["About This Operator", "Skills", "Certifications", "Experience", "CTF Results", "Education"].every((h) => resumePage().includes(`class="wtitle">${h}</h2>`))],
  ["resume has one h1", (resumePage().match(/<h1/g) || []).length === 1],
  ["resume chart bars labelled", resumePage().includes('aria-label="9 out of 10"')],
  ["resume pixel icons render", resumePage().includes('shape-rendering="crispEdges"')],
  ["resume menubar marks current page", resumePage().includes('href="/resume.html" aria-current="page"')],
  ["resume window script inlined", resumePage().includes("aria-expanded")],
  ["resume has no phone number", !/\d{3}[.\-]\d{3}[.\-]\d{4}/.test(resumePage())],
  ["nav links resume", indexPage(posts).includes('href="/resume.html">Resume')],
  ["robots points at sitemap", robotsTxt().includes("Sitemap: https://joshuakrizek.com/sitemap.xml")],
];

// Every indexable page: canonical + Open Graph + parseable JSON-LD.
const pages = {
  index: [indexPage(posts), "https://joshuakrizek.com/"],
  about: [aboutPage(), "https://joshuakrizek.com/about.html"],
  resume: [resumePage(), "https://joshuakrizek.com/resume.html"],
  services: [servicesPage(), "https://joshuakrizek.com/services.html"],
  post: [postPage(post), "https://joshuakrizek.com/posts/academy.html"],
};
for (const [name, [page, url]] of Object.entries(pages)) {
  checks.push([`${name}: canonical`, page.includes(`<link rel="canonical" href="${url}"/>`)]);
  checks.push([`${name}: og tags`, page.includes('property="og:image" content="https://joshuakrizek.com/og.png"') && page.includes(`property="og:url" content="${url}"`)]);
  const ld = page.match(/<script type="application\/ld\+json">(.*?)<\/script>/s);
  if (name !== "services") {
    let parsed = null;
    try { parsed = JSON.parse(ld[1]); } catch {}
    checks.push([`${name}: JSON-LD parses`, !!parsed && parsed["@context"] === "https://schema.org"]);
  }
}
// A post title containing </script> must not break out of the JSON-LD tag.
const evil = postPage({ ...post, title: "x</script><script>alert(1)</script>" });
checks.push(["JSON-LD escapes </script>", !evil.includes("</script><script>alert(1)")]);
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) ok = false;
}
console.log(ok ? "\nAll checks passed. Preview in ./dist-preview" : "\nSOME CHECKS FAILED");
process.exit(ok ? 0 : 1);

