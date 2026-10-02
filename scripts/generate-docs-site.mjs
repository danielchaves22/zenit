import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { marked } from "marked";
import { parse as parseYaml } from "yaml";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "..");
const required = [
  "title",
  "slug",
  "type",
  "audience",
  "visibility",
  "status",
  "owner",
  "last_reviewed",
];
const enums = {
  visibility: ["public", "internal", "restricted"],
  status: ["draft", "active", "deprecated", "archived"],
  audience: ["user", "dev", "ops", "product", "leadership"],
  owner: ["engineering", "product", "design", "ops"],
  type: [
    "overview",
    "functional-spec",
    "technical-spec",
    "architecture-note",
    "setup-guide",
    "operations-guide",
    "testing-guide",
    "example",
    "rfc",
    "decision-record",
    "release-note",
    "legacy-note",
  ],
};
const labels = {
  general: "Comece aqui",
  "zenit-cash": "Zenit Cash",
  "zenit-cash-mobile": "Cash Mobile",
  "zenit-day": "Zenit Day",
  "zenit-clock": "Zenit Clock",
  "zenit-hub": "Zenit Hub",
  "zenit-calc": "Zenit Calc",
  help: "Guias de uso",
  products: "Produtos",
  architecture: "Arquitetura",
  operations: "Operação",
  integrations: "Integrações",
  internal: "Decisões internas",
  legacy: "Histórico",
};
const escape = (value) =>
  String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
const plain = (value) =>
  String(value)
    .replace(/<[^>]*>/g, "")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'");
const inside = (root, file) =>
  file === root ||
  (!path.relative(root, file).startsWith("..") &&
    !path.isAbsolute(path.relative(root, file)));
const hrefFor = (slug) => `${slug.replace(/\/$/, "")}/`;
function files(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const file = path.join(dir, entry.name);
    if (entry.isSymbolicLink())
      throw new Error(`Symlinks are not supported in docs: ${file}`);
    return entry.isDirectory() ? files(file) : [file];
  });
}

export function parseDocument(source, sourcePath) {
  const normalized = source.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---(?:\n|$)/.exec(normalized);
  if (!match) throw new Error(`Missing frontmatter: ${sourcePath}`);
  const metadata = parseYaml(match[1]);
  for (const key of required) {
    if (typeof metadata?.[key] !== "string" || !metadata[key].trim())
      throw new Error(`Missing or invalid ${key}: ${sourcePath}`);
  }
  for (const [key, values] of Object.entries(enums)) {
    if (!values.includes(metadata[key]))
      throw new Error(`Invalid ${key}: ${sourcePath}`);
  }
  if (!/^\/docs(?:\/[a-z0-9]+(?:-[a-z0-9]+)*)*$/.test(metadata.slug))
    throw new Error(`Invalid slug: ${sourcePath}`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(metadata.last_reviewed))
    throw new Error(`Invalid last_reviewed: ${sourcePath}`);
  for (const key of ["related", "tags"]) {
    if (
      metadata[key] !== undefined &&
      (!Array.isArray(metadata[key]) ||
        metadata[key].some((v) => typeof v !== "string"))
    )
      throw new Error(`Invalid ${key}: ${sourcePath}`);
  }
  return {
    ...metadata,
    sourcePath,
    body: normalized.slice(match[0].length).trim(),
  };
}

function headings(body) {
  const used = new Set([
    "conteudo",
    "docs-sidebar",
    "docs-search",
    "search-status",
    "search-results",
  ]);
  const result = [];
  marked.walkTokens(marked.lexer(body), (token) => {
    if (token.type !== "heading") return;
    const text = plain(marked.parseInline(token.text));
    const base =
      text
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .replace(/[^a-z0-9\s-]/g, "")
        .trim()
        .replace(/\s+/g, "-") || "secao";
    let id = base;
    let count = 1;
    while (used.has(id)) id = `${base}-${++count}`;
    used.add(id);
    result.push({
      depth: token.depth,
      text,
      id,
    });
  });
  return result;
}

function groupsFor(docs, mode) {
  const groups = new Map();
  for (const doc of docs.filter((d) => d.slug !== "/docs")) {
    const group =
      mode === "public" ? doc.product || "general" : doc.slug.split("/")[2];
    if (!groups.has(group)) groups.set(group, []);
    groups.get(group).push(doc);
  }
  const order = [
    "general",
    "zenit-cash",
    "zenit-day",
    "zenit-clock",
    "zenit-hub",
    "zenit-cash-mobile",
  ];
  return [...groups]
    .sort(([a], [b]) =>
      mode === "public"
        ? (order.indexOf(a) < 0 ? 99 : order.indexOf(a)) -
          (order.indexOf(b) < 0 ? 99 : order.indexOf(b))
        : a.localeCompare(b),
    )
    .map(([key, entries]) => [
      key,
      entries.sort(
        (a, b) =>
          (a.type === "overview" ? 0 : 1) - (b.type === "overview" ? 0 : 1) ||
          a.title.localeCompare(b.title, "pt-BR"),
      ),
    ]);
}

function layout({
  title,
  summary,
  body,
  mode,
  groups,
  current = "/docs",
  toc = [],
  doc,
}) {
  const publicMode = mode === "public";
  const nav = groups
    .map(
      ([group, docs]) =>
        `<section class="nav-group"><h2>${escape(labels[group] || group)}</h2><ul>${docs.map((d) => `<li><a href="${hrefFor(d.slug)}"${d.slug === current ? ' aria-current="page"' : ""}>${escape(d.title)}</a></li>`).join("")}</ul></section>`,
    )
    .join("");
  const meta = doc
    ? `<p class="doc-meta">Revisado em ${escape(doc.last_reviewed.split("-").reverse().join("/"))}${doc.status === "active" ? "" : ` · ${escape({ draft: "Rascunho", deprecated: "Descontinuado", archived: "Histórico" }[doc.status])}`}</p>`
    : "";
  const tocHtml = toc.length
    ? `<aside class="toc" aria-label="Nesta página"><h2>Nesta página</h2><ul>${toc.map((h) => `<li class="depth-${h.depth}"><a href="#${h.id}">${escape(h.text)}</a></li>`).join("")}</ul></aside>`
    : "";
  return `<!doctype html>
<html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} | Zenit Docs</title><meta name="description" content="${escape(summary)}"><meta name="theme-color" content="#101e35">${publicMode ? `<link rel="canonical" href="https://zenitapp.net${hrefFor(current)}">` : '<meta name="robots" content="noindex,nofollow">'}<link rel="stylesheet" href="/docs/assets/docs.css"><script src="/docs/assets/docs.js" defer></script></head>
<body><a class="skip-link" href="#conteudo">Ir para o conteúdo</a><header class="docs-header"><a class="docs-brand" href="${publicMode ? "/" : "/docs/"}">Zenit<span>Documentação${publicMode ? "" : " interna"}</span></a><nav aria-label="Navegação global">${publicMode ? '<a href="/para-voce">Para você</a><a href="/para-negocios">Para negócios</a><a href="/contato">Suporte</a>' : '<a href="/docs/">Início</a>'}</nav></header>
<div class="docs-shell"><div class="search-area"><label for="docs-search">Pesquisar na documentação</label><input id="docs-search" type="search" placeholder="Ex.: conectar agenda, contas, lembretes" autocomplete="off"><p id="search-status" role="status" aria-live="polite"></p><ul id="search-results" aria-label="Resultados da pesquisa" hidden></ul></div><button class="docs-menu" data-docs-toggle type="button" aria-expanded="false" aria-controls="docs-sidebar">Navegar pelos guias <span aria-hidden="true">☰</span></button>
<div class="docs-layout${toc.length ? "" : " no-toc"}"><aside class="sidebar" id="docs-sidebar"><nav aria-label="Guias de documentação"><a class="nav-home" href="/docs/"${current === "/docs" ? ' aria-current="page"' : ""}>Visão geral</a>${nav}</nav></aside><main id="conteudo" class="content"><article class="doc-article">${meta}${body}</article><footer class="docs-footer">${publicMode ? 'Precisa de ajuda? <a href="/contato">Fale com a Equinox Tecnologia</a>.<span><a href="/privacy">Privacidade</a> · <a href="/terms">Termos de serviço</a></span>' : "Acervo interno. A publicação deste diretório exige controle de acesso na hospedagem."}</footer></main>${tocHtml}</div></div></body></html>`;
}

export function buildDocsSite({
  mode = "public",
  sourceRoot = path.join(repoRoot, "docs"),
  siteRoot = path.join(
    repoRoot,
    "sites",
    mode === "public" ? "zenitapp-public" : "zenitapp-internal",
  ),
} = {}) {
  if (!["public", "internal"].includes(mode))
    throw new Error(`Unknown docs build mode: ${mode}`);
  sourceRoot = path.resolve(sourceRoot);
  siteRoot = path.resolve(siteRoot);
  const outputRoot = path.resolve(siteRoot, "docs");
  // Only replace the generated docs child, never the source or the site itself.
  if (
    outputRoot === siteRoot ||
    !inside(siteRoot, outputRoot) ||
    inside(outputRoot, sourceRoot) ||
    inside(sourceRoot, outputRoot)
  )
    throw new Error("Unsafe documentation output directory");
  const all = files(sourceRoot)
    .filter((f) => f.endsWith(".md"))
    .map((sourcePath) =>
      parseDocument(fs.readFileSync(sourcePath, "utf8"), sourcePath),
    )
    .filter(Boolean);
  const allBySlug = new Map();
  for (const doc of all) {
    if (allBySlug.has(doc.slug)) throw new Error(`Duplicate slug: ${doc.slug}`);
    doc.headings = headings(doc.body);
    allBySlug.set(doc.slug, doc);
  }
  const documents = all.filter(
    (d) => mode === "internal" || d.visibility === "public",
  );
  const selected = new Set(documents);
  const bySource = new Map(all.map((d) => [d.sourcePath, d]));
  const assets = new Set();
  const groups = groupsFor(documents, mode);
  const sections = new Set(
    documents.map((d) => d.slug.split("/")[2]).filter(Boolean),
  );
  const generatedRoots = new Set([
    "/docs",
    ...[...sections].map((s) => `/docs/${s}`),
  ]);
  const errors = [];
  function resolveReference(reference, doc, isImage = false) {
    if (/^(https?:|mailto:)/i.test(reference)) return reference;
    if (/^[a-z][a-z0-9+.-]*:/i.test(reference) || reference.startsWith("//"))
      throw new Error(`Unsupported link protocol in ${doc.sourcePath}`);
    const match = /^([^?#]*)(\?[^#]*)?(#.*)?$/.exec(reference);
    const pathname = decodeURIComponent(match[1]);
    const query = match[2] || "";
    const fragment = match[3] || "";
    const canonical = pathname.replace(/\/$/, "");
    let target;
    if (!pathname) target = doc;
    else if (pathname.startsWith("/docs")) target = allBySlug.get(canonical);
    else if (!pathname.startsWith("/"))
      target = bySource.get(
        path.resolve(path.dirname(doc.sourcePath), pathname),
      );
    if (target) {
      if (!selected.has(target))
        throw new Error(
          `Link to excluded document: ${reference} in ${doc.sourcePath}`,
        );
      if (
        fragment &&
        !target.headings.some(
          (h) => h.id === decodeURIComponent(fragment.slice(1)),
        )
      )
        throw new Error(`Unknown heading: ${reference} in ${doc.sourcePath}`);
      return pathname ? `${hrefFor(target.slug)}${query}${fragment}` : fragment;
    }
    if (generatedRoots.has(canonical))
      return hrefFor(canonical) + query + fragment;
    if (pathname.startsWith("/") && !pathname.startsWith("/docs") && !isImage)
      return reference;
    const file = pathname.startsWith("/docs/")
      ? path.resolve(sourceRoot, pathname.slice(6))
      : path.resolve(path.dirname(doc.sourcePath), pathname);
    if (
      !inside(sourceRoot, file) ||
      !fs.existsSync(file) ||
      !fs.statSync(file).isFile() ||
      file.endsWith(".md")
    )
      throw new Error(
        `Broken local reference: ${reference} in ${doc.sourcePath}`,
      );
    // Assets are published only when referenced; public assets must live beside public docs.
    if (
      mode === "public" &&
      !documents.some((d) =>
        inside(path.join(path.dirname(d.sourcePath), "assets"), file),
      )
    )
      throw new Error(`Asset has no public owner: ${reference}`);
    assets.add(file);
    return `/docs/${path.relative(sourceRoot, file).split(path.sep).map(encodeURIComponent).join("/")}${query}${fragment}`;
  }
  const pages = new Map();
  for (const doc of documents) {
    let headingIndex = 0;
    const renderer = new marked.Renderer();
    renderer.heading = function (token) {
      const heading = doc.headings[headingIndex++];
      return `<h${token.depth} id="${heading.id}">${this.parser.parseInline(token.tokens)}</h${token.depth}>\n`;
    };
    renderer.link = function ({ href, title, tokens, text }) {
      let resolved;
      try {
        resolved = resolveReference(href || "#", doc);
      } catch (error) {
        errors.push(error.message);
        return escape(plain(text));
      }
      return `<a href="${escape(resolved)}"${title ? ` title="${escape(title)}"` : ""}>${this.parser.parseInline(tokens || []) || escape(text)}</a>`;
    };
    renderer.image = ({ href, title, text }) => {
      try {
        return `<img src="${escape(resolveReference(href, doc, true))}" alt="${escape(text)}" loading="lazy"${title ? ` title="${escape(title)}"` : ""}>`;
      } catch (error) {
        errors.push(error.message);
        return "";
      }
    };
    renderer.html = ({ text }) => escape(text); // Raw HTML cannot bypass link/asset visibility checks.
    renderer.table = function (token) {
      return `<div class="table-scroll" role="region" aria-label="Tabela" tabindex="0">${marked.Renderer.prototype.table.call(this, token)}</div>`;
    };
    const body = marked.parse(doc.body, { renderer, gfm: true });
    const related = (doc.related || [])
      .map((slug) => allBySlug.get(slug))
      .filter((d) => d && selected.has(d) && d.slug !== doc.slug);
    const relatedHtml = related.length
      ? `<section class="related"><h2>Continue a leitura</h2><ul>${related.map((d) => `<li><a href="${hrefFor(d.slug)}">${escape(d.title)}</a></li>`).join("")}</ul></section>`
      : "";
    pages.set(
      doc.slug,
      layout({
        title: doc.title,
        summary: doc.summary || doc.title,
        body: body + relatedHtml,
        mode,
        groups,
        current: doc.slug,
        toc: doc.headings.filter((h) => h.depth === 2 || h.depth === 3),
        doc,
      }),
    );
  }
  if (errors.length) throw new Error(errors.join("\n"));
  const cards = (docs) =>
    docs
      .map(
        (d) =>
          `<article class="doc-card"><h3><a href="${hrefFor(d.slug)}">${escape(d.title)}</a></h3><p>${escape(d.summary || "Consulte o guia para conhecer este recurso.")}</p></article>`,
      )
      .join("");
  const home = `<section class="landing-hero"><p class="eyebrow">Zenit Docs</p><h1>${mode === "public" ? "Encontre o próximo passo." : "Referências para desenvolver e operar."}</h1><p>${mode === "public" ? "Guias para começar, organizar sua rotina e conectar os aplicativos. Escolha um produto ou pesquise o que você quer fazer." : "Documentação de produto, arquitetura, integrações e operação. Rascunhos e registros históricos mantêm seu estado identificado."}</p></section>${groups.map(([key, docs]) => `<section class="section-block"><h2>${escape(labels[key] || key)}</h2><div class="doc-card-grid">${cards(docs)}</div></section>`).join("")}`;
  pages.set(
    "/docs",
    layout({
      title: mode === "public" ? "Guias e ajuda" : "Acervo interno",
      summary: "Documentação dos aplicativos Zenit.",
      body: home,
      mode,
      groups,
    }),
  );
  for (const section of sections) {
    const slug = `/docs/${section}`;
    if (pages.has(slug)) continue;
    const title = labels[section] || section;
    pages.set(
      slug,
      layout({
        title,
        summary: `Documentação: ${title}.`,
        mode,
        groups,
        current: slug,
        body: `<h1>${escape(title)}</h1><div class="doc-card-grid">${cards(documents.filter((d) => d.slug.startsWith(slug + "/")))}</div>`,
      }),
    );
  }
  // Resolve and render everything before replacing the previously generated site.
  fs.rmSync(outputRoot, { recursive: true, force: true });
  function write(file, contents) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, contents);
  }
  for (const [slug, html] of pages)
    write(path.join(outputRoot, slug.slice(6), "index.html"), html);
  for (const file of assets)
    write(
      path.join(outputRoot, path.relative(sourceRoot, file)),
      fs.readFileSync(file),
    );
  for (const name of ["docs.css", "docs.js"])
    write(
      path.join(outputRoot, "assets", name),
      fs.readFileSync(path.join(scriptDir, "docs-site", name)),
    );
  const search = documents
    .filter((d) => d.slug !== "/docs")
    .map((d) => ({
      title: d.title,
      summary: d.summary || "",
      url: hrefFor(d.slug),
      product: labels[d.product] || "",
      text: plain(marked.parse(d.body)).replace(/\s+/g, " "),
    }));
  write(
    path.join(outputRoot, "assets", "search-index.json"),
    JSON.stringify(search),
  );
  if (mode === "internal")
    write(
      path.join(siteRoot, "index.html"),
      '<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="robots" content="noindex,nofollow"><meta http-equiv="refresh" content="0;url=/docs/"><title>Zenit Docs interno</title></head><body><a href="/docs/">Abrir documentação interna</a></body></html>',
    );
  return {
    documents: documents.length,
    pages: pages.size,
    assets: assets.size,
    outputRoot,
  };
}

if (
  process.argv[1] &&
  path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    console.log(
      JSON.stringify(buildDocsSite({ mode: process.argv[2] || "public" })),
    );
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
