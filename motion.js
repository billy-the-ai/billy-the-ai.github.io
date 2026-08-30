/* Billy motion layer -- behaviour.
 *
 * Pairs with motion.css. Three jobs: build the repeating word bands, drive the
 * parallax shift, and count numbers up the first time they are seen.
 *
 * The landing page is React and re-renders after hydration, which throws away
 * anything a script inserted beforehand. So every enhancement is idempotent
 * and re-applied when the DOM changes, rather than run once on load and hoped
 * for.
 */
(function () {
  "use strict";

  var reduced = window.matchMedia("(prefers-reduced-motion: reduce)");

  /* ------------------------------------------------------------- bands -- */

  function buildBand(host) {
    if (host.dataset.billyBandReady === "1") return;
    var words = (host.dataset.billyBand || "").split("·")
      .map(function (w) { return w.trim(); })
      .filter(Boolean);
    if (!words.length) return;

    var row = document.createElement("div");
    row.className = "billy-band__row";
    // Two full copies. The keyframe translates by exactly -50%, so the second
    // copy lands where the first began and the loop has no visible seam.
    for (var pass = 0; pass < 2; pass++) {
      words.forEach(function (word) {
        var b = document.createElement("b");
        b.textContent = word;
        row.appendChild(b);
      });
    }
    if (host.dataset.billySpeed) {
      host.style.setProperty("--billy-band-speed", host.dataset.billySpeed);
    }
    host.textContent = "";
    host.appendChild(row);
    host.setAttribute("aria-hidden", "true");   // decoration, not content
    host.dataset.billyBandReady = "1";
  }

  /* ---------------------------------------------------------- parallax -- */

  var parallaxItems = [];
  var ticking = false;

  function collectParallax() {
    parallaxItems = [].slice.call(document.querySelectorAll("[data-billy-parallax]"));
    parallaxItems.forEach(function (el) { el.classList.add("billy-parallax"); });
  }

  function applyParallax() {
    ticking = false;
    var middle = window.innerHeight / 2;
    for (var i = 0; i < parallaxItems.length; i++) {
      var el = parallaxItems[i];
      var depth = parseFloat(el.dataset.billyParallax) || 0.1;
      var box = el.getBoundingClientRect();
      // Skip anything off screen; a long page should not pay for what nobody
      // is looking at.
      if (box.bottom < -200 || box.top > window.innerHeight + 200) continue;
      var fromCentre = (box.top + box.height / 2) - middle;
      el.style.setProperty("--billy-shift", (-fromCentre * depth).toFixed(2) + "px");
    }
  }

  function onScroll() {
    if (ticking || reduced.matches) return;
    ticking = true;
    window.requestAnimationFrame(applyParallax);
  }

  /* ------------------------------------------------------------- count -- */

  function easeOut(t) { return 1 - Math.pow(1 - t, 3); }

  function countUp(el) {
    if (el.dataset.billyCounted === "1") return;
    el.dataset.billyCounted = "1";

    var target = parseFloat(el.dataset.billyCount);
    if (!isFinite(target)) return;
    var suffix = el.dataset.billySuffix || "";
    var decimals = (el.dataset.billyCount.split(".")[1] || "").length;

    if (reduced.matches) {
      el.textContent = target.toLocaleString(undefined, {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
      }) + suffix;
      return;
    }

    el.classList.add("billy-count");
    var duration = parseInt(el.dataset.billyDuration, 10) || 1400;
    var started = null;

    function step(now) {
      if (started === null) started = now;
      var progress = Math.min((now - started) / duration, 1);
      var value = target * easeOut(progress);
      el.textContent = value.toLocaleString(undefined, {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals,
      }) + suffix;
      if (progress < 1) window.requestAnimationFrame(step);
    }
    window.requestAnimationFrame(step);
  }

  var seen = null;
  if ("IntersectionObserver" in window) {
    seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        countUp(entry.target);
        seen.unobserve(entry.target);
      });
    }, { threshold: 0.4 });
  }

  /* --------------------------------------------------------------- run -- */

  function apply() {
    document.querySelectorAll("[data-billy-band]").forEach(buildBand);
    document.querySelectorAll("[data-billy-press]").forEach(function (el) {
      el.classList.add("billy-press");
    });
    document.querySelectorAll("[data-billy-reveal]").forEach(function (el) {
      el.classList.add("billy-reveal");
    });
    document.querySelectorAll("[data-billy-float]").forEach(function (el) {
      el.classList.add("billy-float");
    });
    document.querySelectorAll("[data-billy-count]").forEach(function (el) {
      // Anything already on screen is counted straight away rather than left
      // waiting on the observer. An observer only reports a CHANGE in
      // intersection, and delivery is suspended entirely while a tab is in the
      // background -- so a number sitting in view when the page opens could
      // otherwise sit at zero indefinitely.
      var box = el.getBoundingClientRect();
      var onScreen = box.bottom > 0 && box.top < (window.innerHeight ||
        document.documentElement.clientHeight);
      if (onScreen || !seen) {
        countUp(el);
      } else {
        seen.observe(el);
      }
    });
    collectParallax();
    applyParallax();
  }

  function start() {
    apply();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });

    // React replaces the tree when it hydrates, taking these enhancements with
    // it. Watching for that and re-applying is the difference between this
    // working and it working for half a second.
    if ("MutationObserver" in window) {
      var pending = false;
      new MutationObserver(function () {
        if (pending) return;
        pending = true;
        window.requestAnimationFrame(function () { pending = false; apply(); });
      }).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
