// resume.html — optional window behavior. Everything is readable without it.
// The box in each title bar collapses its window; on wide screens a window
// can be dragged by its title bar and comes to the front when touched.
(() => {
  const wins = [...document.querySelectorAll(".win")];
  let top = 10;

  for (const win of wins) {
    const shade = win.querySelector(".shade");
    shade.addEventListener("click", () => {
      const collapsed = win.classList.toggle("collapsed");
      shade.setAttribute("aria-expanded", String(!collapsed));
    });
    win.addEventListener("pointerdown", () => { win.style.zIndex = ++top; });
  }

  const wide = matchMedia("(min-width: 961px)");
  if (!wide.matches) return;
  document.body.classList.add("draggable");

  for (const win of wins) {
    const bar = win.querySelector(".titlebar");
    let start = null;
    bar.addEventListener("pointerdown", (e) => {
      if (e.button !== 0 || e.target.closest("button")) return;
      const [x, y] = (win.style.translate || "0px 0px").split(" ").map(parseFloat);
      start = { px: e.clientX, py: e.clientY, x: x || 0, y: y || 0 };
      bar.setPointerCapture(e.pointerId);
      win.classList.add("dragging");
    });
    bar.addEventListener("pointermove", (e) => {
      if (!start) return;
      win.style.translate = `${start.x + e.clientX - start.px}px ${start.y + e.clientY - start.py}px`;
    });
    const end = () => { start = null; win.classList.remove("dragging"); };
    bar.addEventListener("pointerup", end);
    bar.addEventListener("pointercancel", end);
  }
})();
