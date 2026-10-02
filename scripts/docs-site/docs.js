document.documentElement.classList.add("js");
const toggle = document.querySelector("[data-docs-toggle]");
const sidebar = document.getElementById("docs-sidebar");
const setMenu = (open) => {
  toggle.setAttribute("aria-expanded", String(open));
  sidebar.classList.toggle("is-open", open);
};
toggle.addEventListener("click", () =>
  setMenu(toggle.getAttribute("aria-expanded") !== "true"),
);
sidebar.addEventListener("click", (event) => {
  if (event.target.closest("a")) setMenu(false);
});
const input = document.getElementById("docs-search");
const results = document.getElementById("search-results");
const status = document.getElementById("search-status");
const normalize = (value) =>
  value
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
let searchIndex;
let requestId = 0;
let timer;
async function search() {
  const id = ++requestId;
  const query = normalize(input.value.trim());
  results.replaceChildren();
  results.hidden = true;
  if (query.length < 2) {
    status.textContent = "";
    return;
  }
  status.textContent = "Pesquisando…";
  try {
    searchIndex ||= fetch("/docs/assets/search-index.json").then((response) => {
      if (!response.ok) throw new Error("Search index unavailable");
      return response.json();
    });
    const index = await searchIndex;
    if (id !== requestId) return;
    const words = query.split(/\s+/);
    const matches = index
      .filter((doc) =>
        words.every((word) =>
          normalize(
            `${doc.title} ${doc.summary} ${doc.product} ${doc.text}`,
          ).includes(word),
        ),
      )
      .sort(
        (a, b) =>
          Number(normalize(b.title).includes(query)) -
          Number(normalize(a.title).includes(query)),
      );
    status.textContent = matches.length
      ? `${matches.length} guia${matches.length === 1 ? "" : "s"} encontrado${matches.length === 1 ? "" : "s"}.${matches.length > 8 ? " Mostrando os 8 primeiros; refine a pesquisa." : ""}`
      : "Nenhum guia encontrado. Tente outro termo ou escolha um aplicativo no menu.";
    for (const doc of matches.slice(0, 8)) {
      const item = document.createElement("li");
      const anchor = document.createElement("a");
      anchor.href = doc.url;
      const title = document.createElement("strong");
      title.textContent = doc.title;
      const summary = document.createElement("span");
      summary.textContent = doc.summary;
      anchor.append(title, summary);
      item.append(anchor);
      results.append(item);
    }
    results.hidden = matches.length === 0;
  } catch {
    searchIndex = undefined;
    if (id === requestId)
      status.textContent =
        "A pesquisa não está disponível. Use o menu de guias ou tente novamente.";
  }
}
input.addEventListener("input", () => {
  clearTimeout(timer);
  requestId++;
  timer = setTimeout(search, 150);
});
input.addEventListener("focus", () => {
  if (input.value.trim().length >= 2) search();
});
document.addEventListener("keydown", (event) => {
  if (event.key !== "Escape") return;
  clearTimeout(timer);
  requestId++;
  results.hidden = true;
  if (toggle.getAttribute("aria-expanded") === "true") {
    setMenu(false);
    toggle.focus();
  }
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".search-area")) {
    clearTimeout(timer);
    results.hidden = true;
    requestId++;
  }
});
