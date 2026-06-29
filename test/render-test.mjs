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
  dateLabel: "July 15, 2025",
  body: blocksToHtml(mockBlocks),
};

const posts = [
  post,
  { title: "Blue", slug: "blue", excerpt: "Exploiting the PEH machine Blue via EternalBlue.", originalUrl: "", tags: ["PEH", "Walkthrough"], dateLabel: "July 7, 2025", body: "<p>Sample.</p>" },
];

if (existsSync(OUT)) await rm(OUT, { recursive: true, force: true });
await mkdir(path.join(OUT, "posts"), { recursive: true });
await mkdir(path.join(OUT, "assets"), { recursive: true });
await cp(path.join(ROOT, "src", "styles.css"), path.join(OUT, "assets", "styles.css"));
await writeFile(path.join(OUT, "index.html"), indexPage(posts));
await writeFile(path.join(OUT, "about.html"), aboutPage());
await writeFile(path.join(OUT, "posts", "academy.html"), postPage(post));

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
];
let ok = true;
for (const [name, pass] of checks) {
  console.log(`${pass ? "PASS" : "FAIL"}  ${name}`);
  if (!pass) ok = false;
}
console.log(ok ? "\nAll checks passed. Preview in ./dist-preview" : "\nSOME CHECKS FAILED");
process.exit(ok ? 0 : 1);

