/* Billy site effects, shared by every page.
 *
 * All decoration: every page reads the same without it, and all of it stops
 * for people who asked their device for less motion.
 *
 *   data-letters      a title whose letters drop in one by one
 *   data-words        a strip of big repeating words that scrolls sideways
 *   .reveal           rises into place the first time it is on screen
 *   data-count        a number that counts up the first time it is on screen
 *   .tilt             a card that leans toward the pointer
 *   #musicToggle      the music button (off until someone presses it)
 */
(function () {
  "use strict";

  var calm = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var finePointer = window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  /* ---- the amber line along the top that fills as you scroll ---- */
  var progress = document.createElement("div");
  progress.className = "page-progress";
  progress.setAttribute("aria-hidden", "true");
  document.body.appendChild(progress);
  var progressQueued = false;
  function drawProgress() {
    progressQueued = false;
    var room = document.documentElement.scrollHeight - window.innerHeight;
    progress.style.setProperty("--progress", room > 0 ? Math.min(1, window.scrollY / room).toFixed(4) : 0);
  }
  window.addEventListener("scroll", function () {
    if (progressQueued) return;
    progressQueued = true;
    requestAnimationFrame(drawProgress);
  }, { passive: true });
  drawProgress();

  /* ---- letters that drop in ---- */
  document.querySelectorAll("[data-letters]").forEach(function (title) {
    var text = title.textContent.trim();
    title.setAttribute("aria-label", text);
    title.textContent = "";
    Array.prototype.forEach.call(text, function (character, index) {
      var span = document.createElement("span");
      span.className = "letter" + (character === " " ? " space" : "");
      span.textContent = character === " " ? " " : character;
      span.setAttribute("aria-hidden", "true");
      span.style.animationDelay = (0.05 * index).toFixed(2) + "s";
      title.appendChild(span);
    });
  });

  /* ---- word bands ---- */
  document.querySelectorAll("[data-words]").forEach(function (band) {
    var words = band.getAttribute("data-words").split("·")
      .map(function (word) { return word.trim(); })
      .filter(Boolean);
    var row = document.createElement("div");
    row.className = "band-row";
    // Two copies side by side; the row slides exactly half its width, so the
    // loop has no seam.
    for (var pass = 0; pass < 2; pass++) {
      words.forEach(function (word) {
        var b = document.createElement("b");
        b.textContent = word;
        row.appendChild(b);
      });
    }
    band.textContent = "";
    band.appendChild(row);
    band.setAttribute("aria-hidden", "true");
  });

  /* ---- counting up ---- */
  function countUp(el) {
    var target = parseFloat(el.getAttribute("data-count"));
    if (!isFinite(target)) return;
    var show = function (value) { el.textContent = Math.round(value).toLocaleString(); };
    if (calm) { show(target); return; }
    // A newer number (say, the live count arriving) retires the older run.
    var run = (el._billyRun || 0) + 1;
    el._billyRun = run;
    var started = null;
    var duration = 1200;
    function step(now) {
      if (el._billyRun !== run) return;
      if (started === null) started = now;
      var progress = Math.min((now - started) / duration, 1);
      show(target * (1 - Math.pow(1 - progress, 3)));
      if (progress < 1) requestAnimationFrame(step);
    }
    requestAnimationFrame(step);
    // Never leave a half-counted number behind if the tab goes to sleep.
    setTimeout(function () { if (el._billyRun === run) show(target); }, duration + 500);
  }
  window.billyCountUp = countUp;

  /* ---- reveal and count when seen ---- */
  var watched = document.querySelectorAll(".reveal, [data-count]");
  if ("IntersectionObserver" in window && !calm) {
    var seen = new IntersectionObserver(function (entries) {
      entries.forEach(function (entry) {
        if (!entry.isIntersecting) return;
        entry.target.classList.add("in");
        if (entry.target.hasAttribute("data-count")) countUp(entry.target);
        seen.unobserve(entry.target);
      });
    }, { threshold: 0.12 });
    watched.forEach(function (el) { seen.observe(el); });
  } else {
    watched.forEach(function (el) { el.classList.add("in"); });
  }

  /* ---- tilt and the pointer glow ---- */
  if (finePointer && !calm) {
    document.querySelectorAll(".tilt").forEach(function (card) {
      card.addEventListener("pointermove", function (event) {
        var box = card.getBoundingClientRect();
        var x = (event.clientX - box.left) / box.width - 0.5;
        var y = (event.clientY - box.top) / box.height - 0.5;
        card.style.transform = "perspective(900px) rotateX(" + (-y * 5).toFixed(2) +
          "deg) rotateY(" + (x * 6).toFixed(2) + "deg) translateY(-3px)";
        card.style.setProperty("--shine-x", ((x + 0.5) * 100).toFixed(1) + "%");
        card.style.setProperty("--shine-y", ((y + 0.5) * 100).toFixed(1) + "%");
      });
      card.addEventListener("pointerleave", function () { card.style.transform = ""; });
    });

    // A soft gold light under the pointer. The real cursor is never hidden.
    var glow = document.createElement("div");
    glow.className = "cursor-glow";
    glow.setAttribute("aria-hidden", "true");
    document.body.appendChild(glow);
    var gx = 0, gy = 0, queued = false;
    window.addEventListener("pointermove", function (event) {
      gx = event.clientX;
      gy = event.clientY;
      if (queued) return;
      queued = true;
      requestAnimationFrame(function () {
        queued = false;
        glow.style.transform = "translate(" + (gx - 200) + "px," + (gy - 200) + "px)";
        glow.classList.add("on");
      });
    }, { passive: true });
    document.documentElement.addEventListener("pointerleave", function () {
      glow.classList.remove("on");
    });
  }

  /* ---- music ---- */
  var musicButton = document.getElementById("musicToggle");
  if (musicButton) {
    var audio = null;
    musicButton.addEventListener("click", function () {
      if (!audio) {
        audio = new Audio(musicButton.getAttribute("data-src"));
        audio.loop = true;
        audio.volume = 0.35;
      }
      var playing = !audio.paused;
      if (playing) {
        audio.pause();
        musicButton.classList.remove("on");
        musicButton.setAttribute("aria-pressed", "false");
        return;
      }
      audio.play().then(function () {
        musicButton.classList.add("on");
        musicButton.setAttribute("aria-pressed", "true");
      }).catch(function () {});
    });
  }
})();
