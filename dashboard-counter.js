/* Live-counter animation for the dashboard's headline numbers.
 *
 * Deliberately additive: it does not touch the code that fetches or writes the
 * stats. It watches the four figures for a change and rolls the old value to
 * the new one, the way a live subscriber count does.
 *
 * Because it works off the rendered value rather than the fetch, it animates
 * whichever way the number moved -- so a purge that lowers the message count
 * visibly counts DOWN rather than silently snapping to a smaller figure.
 */
(function () {
  "use strict";

  var STAT_IDS = [
    "overviewKnowledge",
    "overviewMessages",
    "overviewVoice",
    "overviewModeration",
    "overviewWarnings",
  ];

  var DURATION = 900;
  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  function injectStyles() {
    if (document.getElementById("billy-counter-style")) return;
    var style = document.createElement("style");
    style.id = "billy-counter-style";
    // Tabular figures so the digits do not jiggle while counting, and a brief
    // tint on change so a number that moves is noticed.
    style.textContent =
      ".billy-ticking{font-variant-numeric:tabular-nums;font-feature-settings:'tnum' 1}" +
      ".billy-bumped{animation:billyBump .5s ease}" +
      "@keyframes billyBump{0%{transform:translateY(0)}" +
      "35%{transform:translateY(-3px)}100%{transform:translateY(0)}}" +
      ".billy-down{color:#ff9f8a}.billy-up{color:#8ce0a8}" +
      "@media (prefers-reduced-motion: reduce){.billy-bumped{animation:none}}";
    document.head.appendChild(style);
  }

  /* Split "79.5h" into 79.5 and "h", or "1,204" into 1204 and "". */
  function parseValue(text) {
    var raw = String(text == null ? "" : text).trim();
    if (!raw || raw === "—") return null;           // the em-dash placeholder
    // The separator is kept as part of the suffix. Skipping it with \s* meant
    // "1 saved warnings" was rebuilt as "1saved warnings", because the space
    // was consumed by the pattern and never put back.
    var match = raw.match(/^(-?[\d,]*\.?\d+)(.*)$/);
    if (!match) return null;
    var number = parseFloat(match[1].replace(/,/g, ""));
    if (!isFinite(number)) return null;
    var decimals = (match[1].split(".")[1] || "").length;
    return { number: number, suffix: match[2] || "", decimals: decimals };
  }

  function format(number, decimals, suffix) {
    return number.toLocaleString(undefined, {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }) + suffix;
  }

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  /* Write, and remember exactly what was written.
   *
   * handle() compares against this instead of a flag. A flag set and cleared
   * around the write is useless here: MutationObserver reports afterwards, by
   * which time it has already been cleared, so the animation's own frames
   * looked like fresh external values and each one started another animation.
   */
  function paint(el, text) {
    el.dataset.billyOwn = text;
    el.textContent = text;
  }

  function animate(el, from, to, decimals, suffix) {
    var started = null;
    var finished = false;

    // Retires any animation still running on this element, so two can never
    // paint it at the same time.
    var generation = (parseInt(el.dataset.billyRun, 10) || 0) + 1;
    el.dataset.billyRun = String(generation);

    function current() {
      return String(generation) === el.dataset.billyRun;
    }

    function settle() {
      if (finished) return;
      finished = true;
      if (current()) {
        paint(el, format(to, decimals, suffix));
        el.classList.remove("billy-up", "billy-down");
      }
      document.removeEventListener("visibilitychange", settle);
    }

    // A hidden tab freezes requestAnimationFrame. Without this the number
    // would sit frozen part-way through, showing a figure that is simply
    // wrong -- the same trap the pricing page counters fell into.
    document.addEventListener("visibilitychange", settle);
    window.setTimeout(settle, DURATION + 400);

    function step(now) {
      if (finished || !current()) return;
      if (started === null) started = now;
      var progress = Math.min((now - started) / DURATION, 1);
      if (progress >= 1) { settle(); return; }
      paint(el, format(from + (to - from) * easeOut(progress), decimals, suffix));
      window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  function handle(el) {
    // Our own paint, not a new value from the dashboard. Compared by content
    // rather than by a flag, because a flag cannot survive until the observer
    // runs -- which is what made this recurse without end.
    if (el.textContent === el.dataset.billyOwn) return;
    var parsed = parseValue(el.textContent);
    if (!parsed) return;

    var previous = el.dataset.billyValue;
    el.dataset.billyValue = String(parsed.number);
    el.classList.add("billy-ticking");

    if (previous === undefined || previous === "" || reduced.matches) {
      return;                                            // first paint: no roll
    }
    var from = parseFloat(previous);
    if (!isFinite(from) || from === parsed.number) return;

    el.classList.add("billy-bumped");
    el.classList.add(parsed.number < from ? "billy-down" : "billy-up");
    window.setTimeout(function () { el.classList.remove("billy-bumped"); }, 520);
    animate(el, from, parsed.number, parsed.decimals, parsed.suffix);
  }

  function watch() {
    injectStyles();
    STAT_IDS.forEach(function (id) {
      var el = document.getElementById(id);
      if (!el || el.dataset.billyWatched) return;
      el.dataset.billyWatched = "1";
      handle(el);
      new MutationObserver(function () { handle(el); }).observe(el, {
        childList: true,
        characterData: true,
        subtree: true,
      });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", watch);
  } else {
    watch();
  }
  // The stats load after the page does, and the elements may be re-rendered,
  // so this is re-run rather than assumed to have caught everything.
  window.setInterval(watch, 3000);
})();
