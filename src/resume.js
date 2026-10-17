// resume.html — boot sequence + keyboard shortcuts for the terminal page.
// The <head> adds .booting to <html> (unless reduced motion is on); this
// script reveals each .ln line in order and types out the command lines.
(() => {
  const root = document.documentElement;
  const screen = document.getElementById("screen");
  const skipBtn = document.getElementById("skip");
  const lines = [...screen.querySelectorAll(".ln")];
  const typed = [...screen.querySelectorAll(".cmd .typed")].map((el) => [el, el.textContent]);
  let done = !root.classList.contains("booting");

  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

  function finish() {
    if (done) return;
    done = true;
    for (const [el, text] of typed) el.textContent = text;
    root.classList.remove("booting");
  }

  async function boot() {
    for (const [el] of typed) el.textContent = "";
    for (const ln of lines) {
      if (done) return;
      ln.classList.add("on");
      const t = ln.querySelector(".typed");
      if (t) {
        const text = typed.find(([el]) => el === t)[1];
        await sleep(160);
        for (let i = 1; i <= text.length; i++) {
          if (done) return;
          t.textContent = text.slice(0, i);
          await sleep(32);
        }
        await sleep(140);
      } else {
        await sleep(ln.classList.contains("sys") ? 260 : ln.classList.contains("banner") ? 380 : 28);
      }
    }
    finish();
  }

  // During boot, any key or click skips to the end. Afterwards, E/L/G/P are
  // shortcuts for the keycaps on the bezel.
  document.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey || e.altKey) return;
    if (!done) { finish(); return; }
    if (e.target.closest("input, textarea, [contenteditable]")) return;
    const key = document.querySelector(`.oia [data-key="${e.key.toLowerCase()}"]`);
    if (key) { e.preventDefault(); key.click(); }
  });
  skipBtn.addEventListener("click", finish);
  screen.addEventListener("pointerdown", finish);

  if (!done) boot();
})();
