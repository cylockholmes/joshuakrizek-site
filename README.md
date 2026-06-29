# joshuakrizek.com — Notion-powered static site

A fast, fully static website whose content lives in your **Notion "Blog Posts" database**.
You write and edit posts in Notion; a GitHub Action pulls them through the Notion API,
renders plain HTML, and deploys to GitHub Pages on your domain. No server, no database to run.

```
Edit in Notion  ──►  GitHub Action (build.mjs)  ──►  static HTML  ──►  GitHub Pages  ──►  joshuakrizek.com
```

The site rebuilds automatically **on every push, every 6 hours, and on demand** — so Notion edits
go live without you touching code.

---

## What's in here

| Path | Purpose |
|------|---------|
| `scripts/build.mjs` | Fetches the Notion database + page content and renders `dist/` |
| `src/styles.css` | The site's dark, hacker-inspired theme (edit freely) |
| `.github/workflows/deploy.yml` | Builds and deploys to GitHub Pages |
| `CNAME` | Custom domain (`joshuakrizek.com`) |
| `test/render-test.mjs` | Offline render test — no Notion token needed |

Pages produced: a homepage post index, one page per published post, and an About page.

---

## One-time setup

### 1. Create the repo
Create a **new** GitHub repository (e.g. `joshuakrizek-site`) and push these files to the `main` branch.

### 2. Create a Notion integration token
1. Go to <https://www.notion.so/my-integrations> → **New integration** (internal).
2. Copy the **Internal Integration Secret** (starts with `ntn_` / `secret_`).
3. Open your **Blog Posts** database in Notion → **•••** menu → **Connections** → add your integration so it can read the data.

### 3. Add repo secrets
In the new repo: **Settings → Secrets and variables → Actions → New repository secret**

- `NOTION_TOKEN` = the integration secret from step 2
- `NOTION_DATABASE_ID` *(optional)* = `ee5c13ef-3b7a-4ccb-a28e-9acb92898e3a`
  (already hardcoded as the default in `build.mjs`; only set this if the database changes)

### 4. Turn on Pages
**Settings → Pages → Build and deployment → Source: GitHub Actions.**

### 5. Deploy
Push to `main`, or run the workflow manually from the **Actions** tab. The build logs list each post it renders.

### 6. Point the domain (Cloudflare)
Your domain is already on GitHub Pages, so this is mostly about moving ownership to the new repo:

1. In the **new** repo: **Settings → Pages → Custom domain** → enter `joshuakrizek.com` → Save.
   (If the domain is still claimed by the old `cylockholmes.github.io` repo, remove it there first — a domain can only belong to one Pages site at a time.)
2. In **Cloudflare → DNS**, confirm these apex records exist (they likely already do):

   ```
   A  @  185.199.108.153
   A  @  185.199.109.153
   A  @  185.199.110.153
   A  @  185.199.111.153
   CNAME  www  <your-github-username>.github.io
   ```
   Set the records to **DNS only (grey cloud)** while GitHub provisions the HTTPS certificate; you can re-enable proxy afterward.
3. In repo Pages settings, tick **Enforce HTTPS** once the certificate is issued.

---

## How editing works day-to-day

- **New post:** add a row in the Notion *Blog Posts* database, set **Status = Published**, fill in Title, Slug, Publish Date, Tags, Excerpt, and write the body. The next build publishes it.
- **Unpublish:** set Status to anything other than `Published`.
- **Images:** any image in a Notion post is rendered with its URL as-is. The migrated posts use stable `raw.githubusercontent.com` URLs, so they keep working.
- **Speed:** edits appear within 6 hours automatically, or immediately if you trigger the workflow (**Actions → Build & deploy site → Run workflow**).

### Optional: instant rebuilds
Add a Notion automation (or any webhook caller) that hits GitHub's
`POST /repos/<owner>/<repo>/dispatches` with a personal access token to trigger a build the moment you publish. Not required — the schedule covers it.

---

## Local development

```bash
npm install
NOTION_TOKEN=ntn_xxx npm run build   # writes ./dist
npx serve dist                        # preview at localhost
```

To preview the design **without** a Notion token, run the offline render test, which writes a
sample site to `./dist-preview`:

```bash
node test/render-test.mjs
```

---

## Customizing

- **Design:** edit `src/styles.css`. Colors live in the `:root` block at the top.
- **Layout / sections:** the HTML templates are plain template strings near the bottom of `scripts/build.mjs` (`indexPage`, `postPage`, `aboutPage`).
- **Supported Notion blocks:** headings, paragraphs, code, images, bulleted/numbered lists, quotes, callouts, dividers, and to-dos, with bold/italic/code/strikethrough/underline/link formatting.
