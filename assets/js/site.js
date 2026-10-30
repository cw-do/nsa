// Small runtime fixes for a static site: the build decides what is "upcoming"
// on the day it ran, so the page re-checks against the reader's clock, and
// shows event times in the reader's own time zone.
(function () {
  const now = Date.now();

  document.querySelectorAll("[data-end]").forEach((el) => {
    if (Date.parse(el.dataset.end) >= now) return;
    if (el.classList.contains("tl-item")) {
      el.querySelectorAll("[data-upcoming-tag]").forEach((t) => t.remove());
    } else {
      el.remove();
    }
  });

  document.querySelectorAll("[data-upcoming]").forEach((list) => {
    if (!list.querySelector(".event")) {
      const empty = list.querySelector(".upcoming-empty");
      if (empty) empty.hidden = false;
    }
  });

  let here;
  try { here = Intl.DateTimeFormat().resolvedOptions().timeZone; } catch (e) { return; }
  const fmt = new Intl.DateTimeFormat(undefined, {
    weekday: "long", day: "numeric", month: "long",
    hour: "numeric", minute: "2-digit", timeZoneName: "short",
  });
  document.querySelectorAll(".localtime[data-start]").forEach((el) => {
    const start = new Date(el.dataset.start);
    if (isNaN(start)) return;
    // Skip when the reader is already in the time zone the event is written in.
    const offsetThere = el.dataset.start.slice(-6);
    const m = -start.getTimezoneOffset();
    const offsetHere = (m >= 0 ? "+" : "-") + String(Math.floor(Math.abs(m) / 60)).padStart(2, "0") + ":" + String(Math.abs(m) % 60).padStart(2, "0");
    if (offsetHere === offsetThere) return;
    el.textContent = "Your time: " + fmt.format(start) + (here ? " (" + here.replace(/_/g, " ") + ")" : "");
    el.hidden = false;
  });
})();
