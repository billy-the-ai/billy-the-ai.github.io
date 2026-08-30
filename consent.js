/* Billy cookie consent.
 *
 * Self-contained: injects its own styles, markup and behaviour, so a single
 * script tag adds it to any page on the site.
 *
 * WHAT THIS SITE ACTUALLY DOES, because a consent banner that misdescribes it
 * is worse than none at all: there are no third-party trackers here. No
 * analytics, no tag manager, no pixels. The only storage is a little
 * sessionStorage the pages use to remember where you were, plus the sign-in
 * session if you use the control room. Both are strictly necessary, and
 * strictly necessary storage does not require consent.
 *
 * So the banner tells the truth about that, and the optional category is real
 * infrastructure rather than theatre: nothing optional may run until someone
 * has actively allowed it. window.billyConsent.analytics stays false, and a
 * "billy:consent" event fires on any change, so analytics added later can be
 * gated on it properly instead of loading first and asking afterwards.
 *
 * Defaults are refusal. Closing or ignoring the banner grants nothing.
 */
(function () {
  "use strict";

  var KEY = "billy.consent.v1";
  var LABEL = "Cookie choices";

  /* ------------------------------------------------------------- state -- */

  function read() {
    try {
      var raw = window.localStorage.getItem(KEY);
      if (!raw) return null;
      var parsed = JSON.parse(raw);
      return typeof parsed === "object" && parsed ? parsed : null;
    } catch (error) {
      // Private windows and blocked site data both throw here. That is not a
      // reason to break the page, only a reason to ask again next time.
      return null;
    }
  }

  function write(state) {
    try {
      window.localStorage.setItem(KEY, JSON.stringify(state));
    } catch (error) { /* nothing to do; the choice simply is not remembered */ }
  }

  function publish(state) {
    window.billyConsent = {
      analytics: !!state.analytics,
      decidedAt: state.decidedAt || null,
      // Anything added later should call this rather than reading storage.
      allows: function (name) { return name === "essential" || !!state[name]; },
    };
    try {
      window.dispatchEvent(new CustomEvent("billy:consent", { detail: window.billyConsent }));
    } catch (error) { /* very old browsers; the global is still set */ }
  }

  // Refusal until told otherwise.
  publish(read() || { analytics: false });

  /* ------------------------------------------------------------ styles -- */

  var CSS = [
    ".billy-consent{position:fixed;left:18px;bottom:18px;z-index:2147483000;",
    "max-width:392px;width:calc(100% - 36px);background:#15130f;color:#fff8ec;",
    "border:1px solid #312a1f;border-radius:18px;padding:20px 20px 17px;",
    "box-shadow:0 22px 60px rgba(0,0,0,.55);",
    "font-family:'Segoe UI',system-ui,-apple-system,sans-serif;",
    "transform:translateY(14px);opacity:0;transition:transform .34s cubic-bezier(.2,.8,.3,1),opacity .34s ease}",
    ".billy-consent.is-in{transform:none;opacity:1}",
    ".billy-consent h2{margin:0 0 7px;font-size:15.5px;font-weight:800;letter-spacing:.01em}",
    ".billy-consent p{margin:0 0 14px;font-size:13.2px;line-height:1.62;color:#aaa397}",
    ".billy-consent b{color:#fff8ec;font-weight:700}",
    ".billy-consent__row{display:flex;gap:9px;align-items:center;flex-wrap:wrap}",
    ".billy-consent button{font:inherit;cursor:pointer;border-radius:11px;",
    "padding:11px 17px;font-size:13.5px;font-weight:800;border:1px solid transparent;",
    "transition:transform .15s cubic-bezier(.2,.8,.3,1),background .15s ease,border-color .15s ease}",
    ".billy-consent button:hover{transform:translateY(-1px)}",
    ".billy-consent button:active{transform:translateY(1px) scale(.985)}",
    ".billy-consent__accept{background:#e9a65c;color:#2a1c0c}",
    ".billy-consent__accept:hover{background:#ffd49f}",
    ".billy-consent__decline{background:#1c1812;color:#fff8ec;border-color:#312a1f}",
    ".billy-consent__decline:hover{border-color:#4a4033}",
    ".billy-consent__manage{background:none;color:#aaa397;padding:11px 4px;font-weight:700}",
    ".billy-consent__manage:hover{color:#fff8ec}",
    ".billy-consent button:focus-visible{outline:2px solid #ffd49f;outline-offset:2px}",
    ".billy-consent__detail{margin:4px 0 15px;border-top:1px solid #242018;padding-top:13px}",
    ".billy-consent__item{display:flex;gap:11px;align-items:flex-start;padding:9px 0}",
    ".billy-consent__item small{display:block;color:#aaa397;font-size:12.4px;line-height:1.55;margin-top:2px}",
    ".billy-consent__item strong{font-size:13.4px}",
    ".billy-consent__item input{margin-top:3px;width:16px;height:16px;accent-color:#e9a65c;flex:none}",
    ".billy-consent__fixed{color:#6fe0a5;font-size:11px;font-weight:800;letter-spacing:.09em;",
    "text-transform:uppercase;margin-top:3px;flex:none}",
    "@media (prefers-reduced-motion: reduce){",
    ".billy-consent{transition:none;transform:none;opacity:1}",
    ".billy-consent button{transition:none}",
    ".billy-consent button:hover,.billy-consent button:active{transform:none}}",
    "@media (max-width:520px){.billy-consent{left:12px;bottom:12px;width:calc(100% - 24px);padding:17px}}",
  ].join("");

  function injectStyles() {
    if (document.getElementById("billy-consent-style")) return;
    var style = document.createElement("style");
    style.id = "billy-consent-style";
    style.textContent = CSS;
    document.head.appendChild(style);
  }

  /* ------------------------------------------------------------ banner -- */

  var node = null;
  var lastFocus = null;

  function close(state) {
    write(state);
    publish(state);
    if (node) {
      node.classList.remove("is-in");
      var toRemove = node;
      node = null;
      window.setTimeout(function () {
        if (toRemove.parentNode) toRemove.parentNode.removeChild(toRemove);
      }, 340);
    }
    if (lastFocus && lastFocus.focus) lastFocus.focus();
  }

  function decide(analytics) {
    close({ analytics: !!analytics, decidedAt: new Date().toISOString() });
  }

  function build(showDetail) {
    injectStyles();
    if (node && node.parentNode) node.parentNode.removeChild(node);

    node = document.createElement("div");
    node.className = "billy-consent";
    node.setAttribute("role", "dialog");
    node.setAttribute("aria-modal", "false");
    node.setAttribute("aria-label", LABEL);

    var current = read() || { analytics: false };

    node.innerHTML =
      '<h2>Cookies on this site</h2>' +
      '<p>Billy&rsquo;s site uses <b>no tracking cookies</b>. The only things stored are ' +
      'what is needed for the pages to work and to keep you signed in to the control room. ' +
      'Optional analytics are <b>off</b> and load nothing unless you allow them.</p>' +
      (showDetail
        ? '<div class="billy-consent__detail">' +
            '<div class="billy-consent__item">' +
              '<span class="billy-consent__fixed">On</span>' +
              '<span><strong>Strictly necessary</strong>' +
              '<small>Remembers the page you were on and your control-room sign-in. ' +
              'Cannot be switched off without breaking the site.</small></span>' +
            '</div>' +
            '<div class="billy-consent__item">' +
              '<input type="checkbox" id="billy-consent-analytics"' +
                (current.analytics ? " checked" : "") + '/>' +
              '<span><label for="billy-consent-analytics"><strong>Analytics</strong></label>' +
              '<small>Anonymous counts of which pages get read, so the docs can be improved. ' +
              '<b>None are in use today</b> &mdash; this only takes effect if any are ever added.</small></span>' +
            '</div>' +
          '</div>'
        : '') +
      '<div class="billy-consent__row">' +
        '<button type="button" class="billy-consent__accept">Accept all</button>' +
        '<button type="button" class="billy-consent__decline">Decline all</button>' +
        (showDetail
          ? '<button type="button" class="billy-consent__save billy-consent__manage">Save choices</button>'
          : '<button type="button" class="billy-consent__manage">Manage cookies</button>') +
      '</div>';

    document.body.appendChild(node);
    window.requestAnimationFrame(function () {
      if (node) node.classList.add("is-in");
    });

    node.querySelector(".billy-consent__accept").addEventListener("click", function () {
      decide(true);
    });
    node.querySelector(".billy-consent__decline").addEventListener("click", function () {
      decide(false);
    });
    var manage = node.querySelector(".billy-consent__manage");
    if (showDetail) {
      manage.addEventListener("click", function () {
        var box = document.getElementById("billy-consent-analytics");
        decide(box && box.checked);
      });
    } else {
      manage.addEventListener("click", function () { build(true); });
    }

    // Escape refuses rather than silently granting anything.
    node.addEventListener("keydown", function (event) {
      if (event.key === "Escape") decide(false);
    });
  }

  /* --------------------------------------------------------------- api -- */

  // A footer link can call this to let someone change their mind later, which
  // is required wherever consent is required at all.
  window.billyConsentReopen = function () {
    lastFocus = document.activeElement;
    build(true);
  };

  function start() {
    if (read()) return;          // already decided; do not nag
    lastFocus = document.activeElement;
    build(false);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();
