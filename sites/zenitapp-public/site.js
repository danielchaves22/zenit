document.documentElement.classList.add("js");
const menuButton = document.querySelector("[data-menu-toggle]");
const navigation = document.getElementById("site-navigation");
if (menuButton && navigation) {
  const setMenu = (open) => {
    menuButton.setAttribute("aria-expanded", String(open));
    menuButton.setAttribute(
      "aria-label",
      open ? "Fechar navegação" : "Abrir navegação",
    );
    navigation.classList.toggle("is-open", open);
  };
  menuButton.addEventListener("click", () =>
    setMenu(menuButton.getAttribute("aria-expanded") !== "true"),
  );
  navigation.addEventListener("click", (event) => {
    if (event.target.closest("a")) setMenu(false);
  });
  document.addEventListener("keydown", (event) => {
    if (
      event.key === "Escape" &&
      menuButton.getAttribute("aria-expanded") === "true"
    ) {
      setMenu(false);
      menuButton.focus();
    }
  });
}
