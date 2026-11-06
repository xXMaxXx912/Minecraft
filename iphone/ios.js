// Anpassungen für iPhone/iPad (Safari und Home-Bildschirm-App).
// iOS verkleinert beim Einblenden der Tastatur nicht die Seite, sondern schiebt sie nach oben.
// Darum setzen wir die App-Höhe auf den tatsächlich sichtbaren Bereich (visualViewport).
(() => {
  const root = document.documentElement;
  const vv = window.visualViewport;
  // Volle Höhe je Breite merken: Die Tastatur ändert nur die Höhe, Drehen ändert die Breite.
  const fullHeightByWidth = new Map();

  function update() {
    const w = Math.round(vv ? vv.width * vv.scale : window.innerWidth);
    const h = vv ? vv.height : window.innerHeight;
    const full = Math.max(fullHeightByWidth.get(w) || 0, h);
    fullHeightByWidth.set(w, full);
    root.style.setProperty("--app-height", `${Math.round(h)}px`);
    document.body?.classList.toggle("keyboard-open", full - h > 150);
    if (document.body?.classList.contains("chat-open")) {
      // iOS scrollt die Seite beim Fokussieren mit – zurücksetzen, damit Kopf und Eingabe sichtbar bleiben.
      window.scrollTo(0, 0);
      const log = document.getElementById("log");
      if (log) log.scrollTop = log.scrollHeight;
    }
  }

  if (vv) {
    vv.addEventListener("resize", update);
    vv.addEventListener("scroll", update);
  }
  window.addEventListener("resize", update);
  window.addEventListener("orientationchange", () => setTimeout(update, 300));
  document.addEventListener("DOMContentLoaded", update);
  update();
})();
