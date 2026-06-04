import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { marked } from "marked";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const repoRoot = path.resolve(__dirname, "..");
const docsRoot = path.join(repoRoot, "docs");

const mode = process.argv[2] ?? "public";

const MODE_CONFIG = {
  public: {
    outputRoot: path.join(repoRoot, "sites", "zenitapp-public", "docs"),
    includeVisibilities: new Set(["public"]),
    label: "Public build",
    rootPrefix: "/docs",
  },
  internal: {
    outputRoot: path.join(repoRoot, "sites", "zenitapp-internal", "docs"),
    includeVisibilities: new Set(["public", "internal", "restricted"]),
    label: "Internal build",
    rootPrefix: "/docs",
  },
};

const config = MODE_CONFIG[mode];

if (!config) {
  console.error(`Unknown docs build mode: ${mode}`);
  process.exit(1);
}

const REQUIRED_FIELDS = [
  "title",
  "slug",
  "type",
  "audience",
  "visibility",
  "status",
  "owner",
  "last_reviewed",
];

marked.setOptions({
  gfm: true,
  breaks: false,
});

function walkMarkdownFiles(dirPath) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  const files = [];

  for (const entry of entries) {
    const absolutePath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkMarkdownFiles(absolutePath));
      continue;
    }

    if (entry.isFile() && entry.name.endsWith(".md")) {
      files.push(absolutePath);
    }
  }

  return files;
}

function parseFrontmatter(fileContent, sourcePath) {
  if (!fileContent.startsWith("---\n")) {
    return null;
  }

  const lines = fileContent.split(/\r?\n/);
  let index = 1;
  const frontmatter = {};
  let currentArrayKey = null;

  while (index < lines.length) {
    const line = lines[index];

    if (line === "---") {
      index += 1;
      break;
    }

    if (line.startsWith("  - ") && currentArrayKey) {
      frontmatter[currentArrayKey].push(line.slice(4).trim());
      index += 1;
      continue;
    }

    currentArrayKey = null;

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      index += 1;
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const rawValue = line.slice(separatorIndex + 1).trim();

    if (!rawValue) {
      frontmatter[key] = [];
      currentArrayKey = key;
      index += 1;
      continue;
    }

    frontmatter[key] = rawValue;
    index += 1;
  }

  for (const field of REQUIRED_FIELDS) {
    if (!frontmatter[field]) {
      throw new Error(`Missing required frontmatter field "${field}" in ${sourcePath}`);
    }
  }

  return {
    frontmatter,
    body: lines.slice(index).join("\n").trim(),
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

function slugToOutputPath(slug, outputRoot) {
  const relativeSlug = slug === "/docs" ? "" : slug.replace(/^\/docs\/?/, "");
  return path.join(outputRoot, relativeSlug, "index.html");
}

function normalizeSiteHref(targetSlug) {
  if (targetSlug === "/") {
    return "/";
  }

  if (targetSlug.startsWith("http://") || targetSlug.startsWith("https://") || targetSlug.startsWith("mailto:") || targetSlug.startsWith("#")) {
    return targetSlug;
  }

  if (targetSlug === "/docs") {
    return "/docs/";
  }

  if (targetSlug.startsWith("/docs") && !targetSlug.endsWith("/")) {
    return `${targetSlug}/`;
  }

  return targetSlug;
}

function buildSectionMap(documents) {
  const sections = new Map();

  for (const document of documents) {
    const relativeSlug = document.slug === "/docs" ? "" : document.slug.replace(/^\/docs\/?/, "");
    const [section = "root"] = relativeSlug.split("/").filter(Boolean);

    if (!sections.has(section)) {
      sections.set(section, []);
    }

    sections.get(section).push(document);
  }

  for (const docs of sections.values()) {
    docs.sort((left, right) => left.title.localeCompare(right.title, "pt-BR"));
  }

  return sections;
}

function buildTableOfContents(markdownBody) {
  const lines = markdownBody.split(/\r?\n/);
  const toc = [];

  for (const line of lines) {
    const match = /^(##|###)\s+(.+)$/.exec(line);
    if (!match) {
      continue;
    }

    const depth = match[1].length;
    const text = match[2].trim();
    const anchor = text
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-z0-9\s-]/g, "")
      .trim()
      .replace(/\s+/g, "-");

    toc.push({ depth, text, anchor });
  }

  return toc;
}

function createRenderer(documentsBySource, currentDocument) {
  const renderer = new marked.Renderer();

  renderer.link = ({ href, title, text }) => {
    let resolvedHref = href ?? "#";

    if (href && !href.startsWith("#") && !href.startsWith("http://") && !href.startsWith("https://") && !href.startsWith("mailto:")) {
      if (href.startsWith("/docs")) {
        resolvedHref = normalizeSiteHref(href);
      } else if (href.endsWith(".md") || href.startsWith(".")) {
        const targetSource = path.normalize(path.resolve(path.dirname(currentDocument.sourcePath), href));
        const targetDocument = documentsBySource.get(targetSource);
        if (targetDocument) {
          resolvedHref = normalizeSiteHref(targetDocument.slug);
        }
      }
    }

    const titleAttribute = title ? ` title="${escapeHtml(title)}"` : "";
    return `<a href="${escapeHtml(resolvedHref)}"${titleAttribute}>${text}</a>`;
  };

  return renderer;
}

function renderLayout({
  title,
  description,
  body,
  currentSlug,
  sections,
  toc,
  visibilityLabel,
  currentDocument,
}) {
  const cssHref = "/docs/assets/docs.css";
  const docsHomeHref = "/docs/";
  const mainSiteHref = "/";

  const sectionNav = [...sections.entries()]
    .filter(([sectionKey]) => sectionKey !== "root")
    .map(([sectionKey, docs]) => {
      const label = sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1);
      const items = docs
        .map((doc) => {
          const href = normalizeSiteHref(doc.slug);
          const activeClass = doc.slug === currentSlug ? ' class="active"' : "";
          return `<li${activeClass}><a href="${escapeHtml(href)}">${escapeHtml(doc.title)}</a></li>`;
        })
        .join("");

      return `
        <section class="sidebar-group">
          <h2>${escapeHtml(label)}</h2>
          <ul>${items}</ul>
        </section>
      `;
    })
    .join("");

  const tocHtml = toc.length
    ? `
      <aside class="toc">
        <h2>Nesta pagina</h2>
        <ul>
          ${toc
            .map((item) => `<li class="toc-depth-${item.depth}"><a href="#${escapeHtml(item.anchor)}">${escapeHtml(item.text)}</a></li>`)
            .join("")}
        </ul>
      </aside>
    `
    : "";

  const relatedHtml = Array.isArray(currentDocument?.related) && currentDocument.related.length
    ? `
      <section class="related">
        <h2>Relacionados</h2>
        <ul>
          ${currentDocument.related
            .map((relatedSlug) => {
              const href = normalizeSiteHref(relatedSlug);
              return `<li><a href="${escapeHtml(href)}">${escapeHtml(relatedSlug)}</a></li>`;
            })
            .join("")}
        </ul>
      </section>
    `
    : "";

  return `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)} | Zenit Docs</title>
  <meta name="description" content="${escapeHtml(description)}" />
  <link rel="stylesheet" href="${escapeHtml(cssHref)}" />
</head>
<body>
  <div class="docs-shell">
    <header class="docs-header">
      <div>
        <a class="docs-brand" href="${escapeHtml(mainSiteHref)}">Zenit</a>
        <p class="docs-subtitle">Base de conhecimento versionada em Markdown</p>
      </div>
      <nav class="docs-top-nav" aria-label="Navegacao global">
        <a href="${escapeHtml(docsHomeHref)}">Docs</a>
        <span class="docs-visibility">${escapeHtml(visibilityLabel)}</span>
      </nav>
    </header>

    <div class="docs-layout">
      <aside class="sidebar">
        <section class="sidebar-group">
          <h2>Entrada</h2>
          <ul>
            <li${currentSlug === "/docs" ? ' class="active"' : ""}><a href="${escapeHtml(docsHomeHref)}">Visao geral</a></li>
          </ul>
        </section>
        ${sectionNav}
      </aside>

      <main class="content">
        <article class="doc-article">
          ${body}
          ${relatedHtml}
        </article>
      </main>

      ${tocHtml}
    </div>
  </div>
</body>
</html>`;
}

function renderDocsHome(documents, sections, visibilityLabel) {
  const grouped = [...sections.entries()]
    .filter(([sectionKey]) => sectionKey !== "root")
    .map(([sectionKey, docs]) => {
      const label = sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1);
      const cards = docs
        .map((doc) => {
          const href = normalizeSiteHref(doc.slug);
          return `
            <article class="doc-card">
              <span class="doc-type">${escapeHtml(doc.type)}</span>
              <h3><a href="${escapeHtml(href)}">${escapeHtml(doc.title)}</a></h3>
              <p>${escapeHtml(doc.summary || "Documento sem resumo.")}</p>
            </article>
          `;
        })
        .join("");

      return `
        <section class="section-block">
          <div class="section-heading">
            <p class="eyebrow">${escapeHtml(label)}</p>
            <h2>${escapeHtml(label)}</h2>
          </div>
          <div class="doc-card-grid">
            ${cards}
          </div>
        </section>
      `;
    })
    .join("");

  const body = `
    <section class="landing-hero">
      <p class="eyebrow">Zenit Docs</p>
      <h1>Documentacao organizada por produto, arquitetura e operacao.</h1>
      <p class="landing-copy">
        Este portal e gerado a partir dos Markdown em <code>docs/</code>. O build atual publica apenas os documentos
        compativeis com o modo <strong>${escapeHtml(visibilityLabel)}</strong>.
      </p>
    </section>
    ${grouped || '<section class="section-block"><p>Nenhum documento elegivel para este build.</p></section>'}
  `;

  return renderLayout({
    title: "Zenit Docs",
    description: "Portal de documentacao do ecossistema Zenit.",
    body,
    currentSlug: "/docs",
    sections,
    toc: [],
    visibilityLabel,
    currentDocument: null,
  });
}

function writeFile(filePath, contents) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, contents);
}

function writeDocsCss(outputRoot) {
  const css = `:root {
  --bg-0: #041024;
  --bg-1: #0d1b36;
  --panel: rgba(13, 28, 58, 0.86);
  --panel-strong: rgba(7, 17, 39, 0.94);
  --text: #edf3ff;
  --text-soft: #c7d5ef;
  --text-muted: #9aaccd;
  --brand: #1f63ef;
  --brand-soft: #59b7ff;
  --border: rgba(89, 131, 209, 0.34);
  --shadow: 0 18px 40px rgba(2, 8, 20, 0.36);
}

* { box-sizing: border-box; }

html, body { margin: 0; min-height: 100%; }

body {
  background:
    radial-gradient(60rem 30rem at -12% -12%, rgba(30, 99, 239, 0.28), transparent 60%),
    radial-gradient(40rem 22rem at 110% 0%, rgba(89, 183, 255, 0.18), transparent 55%),
    linear-gradient(160deg, var(--bg-0) 0%, var(--bg-1) 100%);
  color: var(--text);
  font: 16px/1.65 "Segoe UI", sans-serif;
}

a { color: inherit; }
code, pre { font-family: "Cascadia Code", "Consolas", monospace; }

.docs-shell {
  width: min(1380px, 100%);
  margin: 0 auto;
  padding: 24px;
}

.docs-header {
  align-items: center;
  display: flex;
  gap: 16px;
  justify-content: space-between;
  margin-bottom: 24px;
}

.docs-brand {
  color: var(--text);
  font-size: 1.4rem;
  font-weight: 700;
  text-decoration: none;
}

.docs-subtitle {
  color: var(--text-muted);
  margin: 4px 0 0;
}

.docs-top-nav {
  align-items: center;
  display: flex;
  gap: 12px;
}

.docs-top-nav a,
.docs-visibility {
  background: rgba(17, 37, 78, 0.7);
  border: 1px solid var(--border);
  border-radius: 999px;
  color: var(--text-soft);
  padding: 8px 14px;
  text-decoration: none;
}

.docs-layout {
  display: grid;
  gap: 20px;
  grid-template-columns: 280px minmax(0, 1fr) 240px;
}

.sidebar,
.doc-article,
.toc,
.section-block,
.landing-hero {
  background: var(--panel);
  border: 1px solid var(--border);
  border-radius: 20px;
  box-shadow: var(--shadow);
}

.sidebar {
  padding: 18px;
  position: sticky;
  top: 20px;
  height: fit-content;
}

.sidebar-group + .sidebar-group { margin-top: 18px; }

.sidebar h2,
.toc h2,
.related h2 {
  color: var(--text);
  font-size: 0.92rem;
  margin: 0 0 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.sidebar ul,
.toc ul,
.related ul { list-style: none; margin: 0; padding: 0; }

.sidebar li + li,
.toc li + li,
.related li + li { margin-top: 8px; }

.sidebar li a,
.toc a,
.related a {
  color: var(--text-soft);
  text-decoration: none;
}

.sidebar li.active a {
  color: var(--text);
  font-weight: 700;
}

.content { min-width: 0; }

.doc-article {
  padding: 28px;
}

.doc-article h1,
.landing-hero h1 {
  line-height: 1.15;
  margin-top: 0;
}

.doc-article h2,
.doc-article h3 {
  margin-top: 30px;
}

.doc-article p,
.doc-article li,
.landing-copy {
  color: var(--text-soft);
}

.doc-article pre {
  background: rgba(3, 10, 23, 0.88);
  border: 1px solid rgba(83, 122, 190, 0.34);
  border-radius: 14px;
  overflow: auto;
  padding: 14px;
}

.doc-article code {
  background: rgba(255, 255, 255, 0.08);
  border-radius: 6px;
  padding: 0.12rem 0.35rem;
}

.doc-article pre code { background: transparent; padding: 0; }

.toc {
  padding: 18px;
  position: sticky;
  top: 20px;
  height: fit-content;
}

.toc-depth-3 { margin-left: 12px; }

.related {
  border-top: 1px solid var(--border);
  margin-top: 34px;
  padding-top: 18px;
}

.landing-hero,
.section-block {
  padding: 26px;
}

.eyebrow {
  color: var(--brand-soft);
  font-size: 0.82rem;
  font-weight: 700;
  letter-spacing: 0.12em;
  margin: 0 0 10px;
  text-transform: uppercase;
}

.doc-card-grid {
  display: grid;
  gap: 16px;
  grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
}

.doc-card {
  background: rgba(9, 20, 43, 0.8);
  border: 1px solid var(--border);
  border-radius: 16px;
  padding: 18px;
}

.doc-card h3 {
  margin: 8px 0 10px;
}

.doc-card p {
  color: var(--text-soft);
  margin: 0;
}

.doc-card a {
  text-decoration: none;
}

.doc-type {
  color: var(--brand-soft);
  font-size: 0.78rem;
  font-weight: 700;
  text-transform: uppercase;
}

@media (max-width: 1120px) {
  .docs-layout {
    grid-template-columns: 1fr;
  }

  .sidebar,
  .toc {
    position: static;
  }
}
`;

  writeFile(path.join(outputRoot, "assets", "docs.css"), css);
}

const sourceFiles = walkMarkdownFiles(docsRoot);
const parsedDocuments = [];

for (const sourcePath of sourceFiles) {
  const fileContent = fs.readFileSync(sourcePath, "utf8");
  const parsed = parseFrontmatter(fileContent, sourcePath);
  if (!parsed) {
    continue;
  }

  if (!config.includeVisibilities.has(parsed.frontmatter.visibility)) {
    continue;
  }

  parsedDocuments.push({
    sourcePath: path.normalize(sourcePath),
    body: parsed.body,
    ...parsed.frontmatter,
    tags: Array.isArray(parsed.frontmatter.tags) ? parsed.frontmatter.tags : [],
    related: Array.isArray(parsed.frontmatter.related) ? parsed.frontmatter.related : [],
  });
}

parsedDocuments.sort((left, right) => left.slug.localeCompare(right.slug, "en"));

const documentsBySource = new Map(parsedDocuments.map((document) => [document.sourcePath, document]));
const sections = buildSectionMap(parsedDocuments);

fs.rmSync(config.outputRoot, { recursive: true, force: true });
ensureDir(config.outputRoot);
writeDocsCss(config.outputRoot);

for (const document of parsedDocuments) {
  const renderer = createRenderer(documentsBySource, document);
  const htmlBody = marked.parse(document.body, { renderer });
  const toc = buildTableOfContents(document.body);
  const html = renderLayout({
    title: document.title,
    description: document.summary || document.title,
    body: htmlBody,
    currentSlug: document.slug,
    sections,
    toc,
    visibilityLabel: config.label,
    currentDocument: document,
  });

  writeFile(slugToOutputPath(document.slug, config.outputRoot), html);
}

const homeHtml = renderDocsHome(parsedDocuments, sections, config.label);
writeFile(path.join(config.outputRoot, "index.html"), homeHtml);

for (const [sectionKey, docs] of sections.entries()) {
  if (sectionKey === "root") {
    continue;
  }

  const sectionTitle = sectionKey.charAt(0).toUpperCase() + sectionKey.slice(1);
  const cards = docs
    .map((doc) => {
      const href = normalizeSiteHref(doc.slug);
      return `
        <article class="doc-card">
          <span class="doc-type">${escapeHtml(doc.type)}</span>
          <h3><a href="${escapeHtml(href)}">${escapeHtml(doc.title)}</a></h3>
          <p>${escapeHtml(doc.summary || "Documento sem resumo.")}</p>
        </article>
      `;
    })
    .join("");

  const sectionHtml = renderLayout({
    title: `${sectionTitle} docs`,
    description: `Documentacao da secao ${sectionTitle}.`,
    body: `
      <section class="landing-hero">
        <p class="eyebrow">${escapeHtml(sectionTitle)}</p>
        <h1>${escapeHtml(sectionTitle)}</h1>
        <p class="landing-copy">Documentos publicados nesta secao para o build atual.</p>
      </section>
      <section class="section-block">
        <div class="doc-card-grid">${cards}</div>
      </section>
    `,
    currentSlug: `/docs/${sectionKey}`,
    sections,
    toc: [],
    visibilityLabel: config.label,
    currentDocument: null,
  });

  writeFile(path.join(config.outputRoot, sectionKey, "index.html"), sectionHtml);
}

if (mode === "internal") {
  const internalSiteRoot = path.join(repoRoot, "sites", "zenitapp-internal");
  ensureDir(internalSiteRoot);
  writeFile(
    path.join(internalSiteRoot, "index.html"),
    `<!doctype html>
<html lang="pt-BR">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="refresh" content="0; url=/docs/" />
  <title>Zenit Docs Interno</title>
</head>
<body>
  <p>Redirecionando para <a href="/docs/">/docs/</a>...</p>
</body>
</html>`,
  );
}

console.log(`Generated ${parsedDocuments.length} docs for ${config.label} in ${config.outputRoot}`);
