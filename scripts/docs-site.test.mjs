import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { buildDocsSite, parseDocument } from "./generate-docs-site.mjs";

const document = (slug, body, visibility = "public", extra = "") =>
  `---\ntitle: Guia de teste\nslug: ${slug}\ntype: overview\naudience: user\nvisibility: ${visibility}\nstatus: active\nowner: product\nlast_reviewed: 2026-10-02\n${extra}---\n# Guia\n\n${body}\n`;
function fixture(t) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), "zenit-docs-"));
  const sourceRoot = path.join(base, "source");
  const siteRoot = path.join(base, "site");
  fs.mkdirSync(sourceRoot);
  t.after(() => {
    const resolved = path.resolve(base);
    assert.equal(path.dirname(resolved), path.resolve(os.tmpdir()));
    assert.ok(path.basename(resolved).startsWith("zenit-docs-"));
    fs.rmSync(resolved, { recursive: true, force: true });
  });
  return {
    sourceRoot,
    siteRoot,
    write(file, contents) {
      const target = path.join(sourceRoot, file);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, contents);
    },
    read(file) {
      return fs.readFileSync(path.join(siteRoot, "docs", file), "utf8");
    },
  };
}
test("accepts Windows CRLF, BOM and quoted YAML; rejects malformed metadata", () => {
  const parsed = parseDocument(
    "\uFEFF" +
      document("/docs/help/test", "Texto")
        .replaceAll("\n", "\r\n")
        .replace("Guia de teste", '"Guia: início"'),
    "test.md",
  );
  assert.equal(parsed.title, "Guia: início");
  assert.throws(
    () => parseDocument("# Sem metadados", "test.md"),
    /Missing frontmatter/,
  );
  assert.throws(
    () => parseDocument(document("/docs/../escape", "Texto"), "test.md"),
    /Invalid slug/,
  );
  assert.throws(
    () =>
      parseDocument(
        document("/docs/test", "Texto").replace(
          "status: active",
          "status: ready",
        ),
        "test.md",
      ),
    /Invalid status/,
  );
});
test("public build excludes private docs, related links, search records and unreferenced assets", (t) => {
  const f = fixture(t);
  f.write(
    "help/a.md",
    document(
      "/docs/help/a",
      "## Uso\n\nTexto público.",
      "public",
      "related:\n  - /docs/internal/secret\n",
    ),
  );
  f.write(
    "internal/secret.md",
    document("/docs/internal/secret", "SENSITIVE_TEST_SENTINEL", "restricted"),
  );
  f.write("internal/assets/private.txt", "PRIVATE_FILE_SENTINEL");
  f.write("help/assets/unused.txt", "UNREFERENCED_FILE_SENTINEL");
  buildDocsSite(f);
  assert.equal(
    fs.existsSync(path.join(f.siteRoot, "docs/internal/secret/index.html")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(f.siteRoot, "docs/internal/assets/private.txt")),
    false,
  );
  assert.equal(
    fs.existsSync(path.join(f.siteRoot, "docs/help/assets/unused.txt")),
    false,
  );
  assert.doesNotMatch(
    f.read("help/a/index.html"),
    /internal\/secret|SENSITIVE_TEST_SENTINEL/,
  );
  assert.doesNotMatch(
    f.read("assets/search-index.json"),
    /SENSITIVE_TEST_SENTINEL/,
  );
  buildDocsSite({ ...f, mode: "internal" });
  assert.match(f.read("internal/secret/index.html"), /SENSITIVE_TEST_SENTINEL/);
  assert.match(f.read("internal/secret/index.html"), /noindex,nofollow/);
});
test("headings and TOC use the same unique ids and ignore code fences", (t) => {
  const f = fixture(t);
  f.write(
    "a.md",
    document(
      "/docs/help/a",
      "## Conexões\n\n## Conexões\n\n## Conexões-2\n\n## Conteúdo\n\n```md\n## Not a heading\n```\n\n### **Detalhes**",
    ),
  );
  buildDocsSite(f);
  const html = f.read("help/a/index.html");
  assert.match(html, /<h2 id="conexoes">/);
  assert.match(html, /<h2 id="conexoes-2">/);
  assert.match(html, /href="#conexoes-2"/);
  assert.match(html, /<h2 id="conexoes-2-2">/);
  assert.match(html, /<h2 id="conteudo-2">/);
  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]);
  assert.equal(new Set(ids).size, ids.length);
  assert.match(html, /<h3 id="detalhes"><strong>Detalhes/);
  assert.doesNotMatch(html, /href="#not-a-heading"/);
});
test("resolves source-relative images, linked images and Markdown links with anchors", (t) => {
  const f = fixture(t);
  f.write(
    "help/a.md",
    document(
      "/docs/help/a",
      "[Próximo](b.md#uso)\n\n![Imagem](assets/example.svg)\n\n[![Imagem](assets/example.svg)](b.md#uso)",
    ),
  );
  f.write(
    "help/b.md",
    document("/docs/help/b", "## Uso\n\nLeia [aqui](a.md)."),
  );
  f.write(
    "help/assets/example.svg",
    '<svg xmlns="http://www.w3.org/2000/svg"/>',
  );
  buildDocsSite(f);
  const html = f.read("help/a/index.html");
  assert.match(html, /href="\/docs\/help\/b\/#uso"/);
  assert.equal(
    (html.match(/src="\/docs\/help\/assets\/example.svg"/g) || []).length,
    2,
  );
  assert.ok(
    fs.existsSync(path.join(f.siteRoot, "docs/help/assets/example.svg")),
  );
});
test("broken or excluded references fail before replacing the last good output", (t) => {
  const f = fixture(t);
  f.write("a.md", document("/docs/help/a", "Publicado."));
  buildDocsSite(f);
  const before = f.read("help/a/index.html");
  f.write("a.md", document("/docs/help/a", "[Erro](missing.md)"));
  assert.throws(() => buildDocsSite(f), /Broken local reference/);
  assert.equal(f.read("help/a/index.html"), before);
  f.write(
    "secret.md",
    document("/docs/internal/secret", "Segredo", "internal"),
  );
  f.write("a.md", document("/docs/help/a", "[Segredo](secret.md)"));
  assert.throws(() => buildDocsSite(f), /excluded document/);
  f.write("a.md", document("/docs/help/a", "[Erro](#missing-heading)"));
  assert.throws(() => buildDocsSite(f), /Unknown heading/);
});
test("rejects duplicate slugs, unsafe output and assets outside the allowed source", (t) => {
  const f = fixture(t);
  f.write("a.md", document("/docs/help/a", "Texto"));
  f.write("b.md", document("/docs/help/a", "Outro"));
  assert.throws(() => buildDocsSite(f), /Duplicate slug/);
  assert.throws(
    () => buildDocsSite({ ...f, siteRoot: f.sourceRoot }),
    /Unsafe documentation output/,
  );
  f.write("b.md", document("/docs/help/b", "![Imagem](../outside.png)"));
  assert.throws(() => buildDocsSite(f), /Broken local reference/);
  f.write(
    "b.md",
    document("/docs/help/b", "[![Imagem](internal/assets/test.png)](a.md)"),
  );
  f.write("internal/assets/test.png", "private");
  assert.throws(() => buildDocsSite(f), /Asset has no public owner/);
});
