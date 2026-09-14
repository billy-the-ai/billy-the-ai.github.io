/* Billy appearance: light or dark, and your own accent colour.
 *
 * Loaded in <head> on every page of the website and the Control Room, before
 * the stylesheets, so the saved look is applied before anything is painted
 * (no white flash for someone who chose dark).
 *
 * The choice lives in this browser only (localStorage), and the website and
 * the Control Room share it: pick a colour once and both follow. Another open
 * tab updates too.
 *
 *   window.billyAppearance.get()                     -> { mode, accent }
 *   window.billyAppearance.set({ mode, accent })     mode: light | dark | auto
 *   window.billyAppearance.reset()
 */
(function () {
  "use strict";

  var KEY = "billy.appearance.v1";
  var DEFAULT_ACCENT = "#2350c8";
  var MODES = ["light", "dark", "auto"];
  var SWATCHES = [
    ["Cobalt", "#2350c8"], ["Ocean", "#0f8fb3"], ["Mint", "#12946b"], ["Amber", "#d9822b"],
    ["Crimson", "#c7352b"], ["Rose", "#d6457a"], ["Violet", "#7a4fd6"], ["Graphite", "#4b5568"],
  ];
  var root = document.documentElement;
  var systemDark = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  /* ---- colour maths ---- */
  function parseHex(hex) {
    var m = /^#?([0-9a-f]{6})$/i.exec(String(hex || "").trim());
    if (!m) return null;
    var n = parseInt(m[1], 16);
    return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
  }
  function toHex(rgb) {
    return "#" + rgb.map(function (v) {
      return Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, "0");
    }).join("");
  }
  function mix(a, b, amount) {
    return a.map(function (v, i) { return v + (b[i] - v) * amount; });
  }
  function luminance(rgb) {
    var c = rgb.map(function (v) {
      v /= 255;
      return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
    });
    return 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  }
  function contrast(a, b) {
    var x = luminance(a), y = luminance(b);
    return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05);
  }
  /* Nudge a colour toward black or white until it is readable on a ground. */
  function readableOn(rgb, ground, target, toward) {
    var out = rgb;
    for (var i = 0; i < 20 && contrast(out, ground) < target; i++) out = mix(out, toward, 0.08);
    return out;
  }

  /* ---- storage ---- */
  function load() {
    var saved = {};
    try { saved = JSON.parse(localStorage.getItem(KEY) || "{}") || {}; } catch (e) { saved = {}; }
    return {
      mode: MODES.indexOf(saved.mode) >= 0 ? saved.mode : "light",
      accent: parseHex(saved.accent) ? saved.accent.toLowerCase() : DEFAULT_ACCENT,
    };
  }
  function save(state) {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* private mode */ }
  }

  var state = load();

  function resolvedMode() {
    if (state.mode === "auto") return systemDark && systemDark.matches ? "dark" : "light";
    return state.mode;
  }

  var ACCENT_VARS = ["--accent", "--accent-deep", "--accent-rgb", "--accent-deep-rgb", "--accent-ink",
    "--cream", "--peach", "--link", "--gold-soft", "--gold-line", "--line-hover",
    "--amber", "--amber-2", "--amber-deep", "--on-amber", "--accent-soft"];

  function apply() {
    var dark = resolvedMode() === "dark";
    root.setAttribute("data-theme", dark ? "dark" : "light");
    ACCENT_VARS.forEach(function (name) { root.style.removeProperty(name); });

    // Light mode with the house colour is exactly what the stylesheets say.
    if (dark || state.accent !== DEFAULT_ACCENT) {
      var base = parseHex(state.accent) || parseHex(DEFAULT_ACCENT);
      var ground = dark ? [13, 18, 32] : [255, 255, 255];
      var accent = dark ? readableOn(base, ground, 4.2, [255, 255, 255])
                        : readableOn(base, ground, 4.5, [0, 0, 0]);
      var deep = mix(accent, [0, 0, 0], dark ? 0.18 : 0.28);
      var text = dark ? readableOn(mix(accent, [255, 255, 255], 0.2), ground, 6, [255, 255, 255])
                      : readableOn(mix(accent, [0, 0, 0], 0.12), ground, 6, [0, 0, 0]);
      var ink = luminance(accent) > 0.42 ? "#0d1220" : "#ffffff";
      var rgb = accent.map(Math.round).join(", ");
      var set = {
        "--accent": toHex(accent), "--accent-deep": toHex(deep), "--accent-ink": ink,
        "--accent-rgb": rgb, "--accent-deep-rgb": deep.map(Math.round).join(", "),
        "--cream": toHex(text), "--peach": toHex(text), "--link": toHex(text),
        "--gold-soft": "rgba(" + rgb + ", " + (dark ? 0.14 : 0.07) + ")",
        "--gold-line": "rgba(" + rgb + ", " + (dark ? 0.4 : 0.26) + ")",
        "--line-hover": "rgba(" + rgb + ", " + (dark ? 0.55 : 0.45) + ")",
        "--amber": toHex(accent), "--amber-2": toHex(text), "--amber-deep": toHex(deep),
        "--on-amber": ink, "--accent-soft": "rgba(" + rgb + ", " + (dark ? 0.16 : 0.08) + ")",
      };
      Object.keys(set).forEach(function (name) { root.style.setProperty(name, set[name]); });
    }

    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", dark ? "#0d1220" : "#f6f4ee");
    syncPanel();
  }

  function set(next) {
    if (next && MODES.indexOf(next.mode) >= 0) state.mode = next.mode;
    if (next && parseHex(next.accent)) state.accent = next.accent.toLowerCase();
    save(state);
    apply();
  }

  apply();
  if (systemDark) {
    var onSystem = function () { if (state.mode === "auto") apply(); };
    if (systemDark.addEventListener) systemDark.addEventListener("change", onSystem);
    else if (systemDark.addListener) systemDark.addListener(onSystem);
  }
  window.addEventListener("storage", function (event) {
    if (event.key === KEY) { state = load(); apply(); }
  });

  window.billyAppearance = {
    get: function () { return { mode: state.mode, accent: state.accent }; },
    set: set,
    reset: function () { set({ mode: "light", accent: DEFAULT_ACCENT }); },
  };

  /* ---- the Appearance button and panel ---- */
  var button = null, panel = null;

  var STYLE = [
    ".billy-look-btn{display:inline-grid;place-items:center;flex:none;width:40px;height:40px;padding:0;border-radius:12px;",
    "border:1px solid var(--line,rgba(20,33,61,.12));background:var(--panel,var(--surface,#fff));color:var(--ink,var(--text,#14213d));",
    "cursor:pointer;transition:border-color .2s,transform .18s}",
    ".billy-look-btn:hover{border-color:var(--accent,var(--amber,#2350c8));transform:translateY(-1px)}",
    ".billy-look-btn svg{width:20px;height:20px;fill:none;stroke:currentColor;stroke-width:1.8;stroke-linecap:round;stroke-linejoin:round}",
    ".billy-look-btn.floating{position:fixed;right:18px;bottom:18px;z-index:2147482000;width:48px;height:48px;border-radius:50%;box-shadow:0 12px 30px rgba(0,0,0,.18)}",
    ".billy-look{position:fixed;z-index:2147482500;width:min(320px,calc(100vw - 24px));padding:18px;border-radius:16px;",
    "background:var(--panel,var(--surface,#fff));color:var(--ink,var(--text,#14213d));border:1px solid var(--line,rgba(20,33,61,.12));",
    "box-shadow:0 24px 60px rgba(0,0,0,.25);font:15px/1.5 inherit;font-family:inherit}",
    ".billy-look h2{margin:0 0 2px;font-size:18px;letter-spacing:0}",
    ".billy-look p{margin:0 0 14px;font-size:13px;color:var(--muted,#56627a)}",
    ".billy-look-label{margin:14px 0 8px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--muted,#56627a)}",
    ".billy-look-modes{display:grid;grid-template-columns:repeat(3,1fr);gap:6px;padding:4px;border-radius:12px;background:var(--panel-2,var(--surface-2,#eef1f6))}",
    ".billy-look-modes button{padding:8px 4px;border:0;border-radius:9px;background:none;color:inherit;font:inherit;font-size:14px;font-weight:700;cursor:pointer}",
    ".billy-look-modes button[aria-pressed=true]{background:var(--accent,var(--amber,#2350c8));color:var(--accent-ink,var(--on-amber,#fff))}",
    ".billy-look-swatches{display:grid;grid-template-columns:repeat(4,1fr);gap:8px}",
    ".billy-look-swatches button{position:relative;height:38px;border-radius:10px;border:2px solid transparent;cursor:pointer;",
    "box-shadow:inset 0 0 0 1px rgba(0,0,0,.12)}",
    ".billy-look-swatches button[aria-pressed=true]{border-color:var(--ink,var(--text,#14213d))}",
    ".billy-look-swatches button[aria-pressed=true]::after{content:'\\2713';position:absolute;inset:0;display:grid;place-items:center;color:#fff;font-weight:700;text-shadow:0 1px 2px rgba(0,0,0,.5)}",
    ".billy-look-custom{display:flex;align-items:center;gap:10px;margin-top:10px;font-size:14px}",
    ".billy-look-custom input{width:44px;height:32px;padding:0;border:1px solid var(--line,rgba(20,33,61,.12));border-radius:8px;background:none;cursor:pointer}",
    ".billy-look-foot{display:flex;justify-content:space-between;align-items:center;margin-top:16px;padding-top:12px;border-top:1px solid var(--line,rgba(20,33,61,.12))}",
    ".billy-look-foot small{color:var(--muted,#56627a);font-size:12px}",
    ".billy-look-foot button{padding:7px 12px;border-radius:9px;border:1px solid var(--line,rgba(20,33,61,.12));background:none;color:inherit;font:inherit;font-size:13px;font-weight:700;cursor:pointer}",
    ".billy-look button:focus-visible,.billy-look input:focus-visible,.billy-look-btn:focus-visible{outline:2px solid var(--accent,var(--amber,#2350c8));outline-offset:2px}",
  ].join("");

  var ICON = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3a9 9 0 1 0 0 18c1 0 1.6-.8 1.6-1.7 0-.5-.2-.9-.5-1.2-.3-.3-.5-.7-.5-1.2 0-.9.8-1.7 1.7-1.7H16a5 5 0 0 0 5-5C21 6.6 17 3 12 3Z"/><circle cx="7.5" cy="11" r="1.2"/><circle cx="10.5" cy="7" r="1.2"/><circle cx="15.5" cy="7.5" r="1.2"/></svg>';

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    Object.keys(attrs || {}).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text) node.textContent = text;
    return node;
  }

  function buildPanel() {
    panel = el("div", { class: "billy-look", role: "dialog", "aria-label": "Appearance", id: "billyLook" });
    panel.hidden = true;
    panel.appendChild(el("h2", {}, "Appearance"));
    panel.appendChild(el("p", {}, "Saved in this browser, for the website and the Control Room."));

    panel.appendChild(el("div", { class: "billy-look-label" }, "Mode"));
    var modes = el("div", { class: "billy-look-modes", role: "group", "aria-label": "Mode" });
    [["light", "☀ Light"], ["dark", "☾ Dark"], ["auto", "Auto"]].forEach(function (m) {
      var b = el("button", { type: "button", "data-mode": m[0], title: m[0] === "auto" ? "Follow your device" : "" }, m[1]);
      b.addEventListener("click", function () { set({ mode: m[0] }); });
      modes.appendChild(b);
    });
    panel.appendChild(modes);

    panel.appendChild(el("div", { class: "billy-look-label" }, "Accent colour"));
    var swatches = el("div", { class: "billy-look-swatches", role: "group", "aria-label": "Accent colour" });
    SWATCHES.forEach(function (s) {
      var b = el("button", { type: "button", "data-accent": s[1], "aria-label": s[0], title: s[0] });
      b.style.background = s[1];
      b.addEventListener("click", function () { set({ accent: s[1] }); });
      swatches.appendChild(b);
    });
    panel.appendChild(swatches);

    var custom = el("label", { class: "billy-look-custom" });
    var picker = el("input", { type: "color", "aria-label": "Pick any colour" });
    picker.addEventListener("input", function () { set({ accent: picker.value }); });
    custom.appendChild(picker);
    custom.appendChild(document.createTextNode("Or pick any colour"));
    panel.appendChild(custom);

    var foot = el("div", { class: "billy-look-foot" });
    foot.appendChild(el("small", {}, "Billy picks readable shades for you."));
    var reset = el("button", { type: "button" }, "Reset");
    reset.addEventListener("click", function () { window.billyAppearance.reset(); });
    foot.appendChild(reset);
    panel.appendChild(foot);
    document.body.appendChild(panel);
  }

  function syncPanel() {
    if (!panel) return;
    panel.querySelectorAll("[data-mode]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-mode") === state.mode ? "true" : "false");
    });
    panel.querySelectorAll("[data-accent]").forEach(function (b) {
      b.setAttribute("aria-pressed", b.getAttribute("data-accent") === state.accent ? "true" : "false");
    });
    var picker = panel.querySelector('input[type="color"]');
    if (picker) picker.value = state.accent;
  }

  function place() {
    var box = button.getBoundingClientRect();
    var width = panel.offsetWidth;
    var floating = button.classList.contains("floating");
    var left = Math.min(window.innerWidth - width - 12, Math.max(12, box.right - width));
    panel.style.left = left + "px";
    if (floating) {
      panel.style.top = "";
      panel.style.bottom = (window.innerHeight - box.top + 10) + "px";
    } else {
      panel.style.bottom = "";
      panel.style.top = (box.bottom + 10) + "px";
    }
  }

  function open() {
    panel.hidden = false;
    button.setAttribute("aria-expanded", "true");
    place();
    var first = panel.querySelector('[aria-pressed="true"]') || panel.querySelector("button");
    if (first) first.focus();
  }
  function close(returnFocus) {
    if (panel.hidden) return;
    panel.hidden = true;
    button.setAttribute("aria-expanded", "false");
    if (returnFocus) button.focus();
  }

  function mount() {
    var style = el("style", { id: "billyLookStyle" });
    style.textContent = STYLE;
    document.head.appendChild(style);

    button = el("button", { type: "button", class: "billy-look-btn", "aria-label": "Appearance: dark mode and colours",
      title: "Appearance", "aria-haspopup": "dialog", "aria-expanded": "false", "aria-controls": "billyLook" });
    button.innerHTML = ICON;

    // Beside "Add to Discord" on the website, in the top bar of the Control Room.
    var siteSlot = document.querySelector(".site-header .container");
    var dashSlot = document.querySelector(".topbar .top-actions");
    if (dashSlot) {
      dashSlot.insertBefore(button, dashSlot.firstChild);
    } else if (siteSlot) {
      var cta = siteSlot.querySelector(".btn");
      siteSlot.insertBefore(button, cta || null);
    } else {
      button.classList.add("floating");
      document.body.appendChild(button);
    }

    buildPanel();
    syncPanel();
    button.addEventListener("click", function () { panel.hidden ? open() : close(false); });
    document.addEventListener("keydown", function (event) { if (event.key === "Escape") close(true); });
    document.addEventListener("click", function (event) {
      if (!panel.hidden && !panel.contains(event.target) && !button.contains(event.target)) close(false);
    });
    window.addEventListener("resize", function () { if (!panel.hidden) place(); });
    window.addEventListener("scroll", function () { if (!panel.hidden) place(); }, { passive: true });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();
})();
