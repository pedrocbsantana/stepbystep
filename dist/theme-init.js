/* Aplica o tema antes de desenhar a página, sem piscar. Carregado no <head>, de forma bloqueante. */
try {
  var t = localStorage.getItem("stepbystep-theme");
  if (t === "light" || (t === "system" && matchMedia("(prefers-color-scheme: light)").matches))
    document.documentElement.dataset.theme = "light";
} catch (e) {}
