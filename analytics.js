/* Billy analytics -- Google Analytics 4, Meta Pixel, TikTok Pixel.
 *
 * ============================================================
 *  PUT YOUR IDs HERE. Until then nothing loads and no request
 *  leaves the browser -- which is the correct resting state.
 * ============================================================
 *
 * Two rules govern everything below.
 *
 * 1. Nothing loads before consent. Not the script tag, not a preconnect,
 *    nothing. The usual pattern -- load the tag, then ask -- has already
 *    tracked the visitor by the time the banner appears, which makes the
 *    banner decorative and, where consent is required, makes it unlawful.
 *
 * 2. Withdrawal has to mean something. A tag cannot be unloaded once running,
 *    so consent is also pushed down into each provider's own switch: Google
 *    Consent Mode, fbq('consent', 'revoke'), and TikTok's opt-out.
 */
(function () {
  "use strict";

  var CONFIG = {
    // Google Analytics 4 measurement id, e.g. "G-XXXXXXXXXX"
    ga4: "",
    // Meta (Facebook) pixel id, e.g. "1234567890123456"
    metaPixel: "",
    // TikTok pixel id, e.g. "CXXXXXXXXXXXXXXXXXXX"
    tiktokPixel: "",
  };

  /* Names of what is actually switched on, so the consent banner can describe
     reality instead of a guess. Read by consent.js. */
  var configured = [];
  if (CONFIG.ga4) configured.push("Google Analytics");
  if (CONFIG.metaPixel) configured.push("Meta Pixel");
  if (CONFIG.tiktokPixel) configured.push("TikTok Pixel");
  window.billyAnalyticsConfigured = configured;

  if (!configured.length) return;      // nothing to do, and nothing loaded

  var loaded = { ga4: false, meta: false, tiktok: false };

  function addScript(src, onload) {
    var script = document.createElement("script");
    script.async = true;
    script.src = src;
    if (onload) script.onload = onload;
    document.head.appendChild(script);
    return script;
  }

  /* ------------------------------------------------------------- google -- */

  // Consent Mode is declared up front, denied, even though the tag itself is
  // not loaded yet. If the tag ever arrives by another route it still starts
  // from refusal rather than from consent.
  window.dataLayer = window.dataLayer || [];
  function gtag() { window.dataLayer.push(arguments); }
  window.gtag = window.gtag || gtag;

  gtag("consent", "default", {
    ad_storage: "denied",
    ad_user_data: "denied",
    ad_personalization: "denied",
    analytics_storage: "denied",
    wait_for_update: 500,
  });

  function startGa4() {
    if (loaded.ga4 || !CONFIG.ga4) return;
    loaded.ga4 = true;
    addScript("https://www.googletagmanager.com/gtag/js?id=" + encodeURIComponent(CONFIG.ga4));
    gtag("js", new Date());
    // IP anonymisation on, and no ad-personalisation signals: this is here to
    // count page reads, not to build profiles of the people reading them.
    gtag("config", CONFIG.ga4, {
      anonymize_ip: true,
      allow_google_signals: false,
      allow_ad_personalization_signals: false,
    });
  }

  function startMeta() {
    if (loaded.meta || !CONFIG.metaPixel) return;
    loaded.meta = true;
    /* eslint-disable */
    !function (f, b, e, v, n, t, s) {
      if (f.fbq) return; n = f.fbq = function () {
        n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments);
      };
      if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = "2.0";
      n.queue = []; t = b.createElement(e); t.async = !0; t.src = v;
      s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s);
    }(window, document, "script", "https://connect.facebook.net/en_US/fbevents.js");
    /* eslint-enable */
    window.fbq("consent", "grant");
    window.fbq("init", CONFIG.metaPixel);
    window.fbq("track", "PageView");
  }

  function startTiktok() {
    if (loaded.tiktok || !CONFIG.tiktokPixel) return;
    loaded.tiktok = true;
    var w = window, d = document, id = CONFIG.tiktokPixel;
    w.TiktokAnalyticsObject = "ttq";
    var ttq = w.ttq = w.ttq || [];
    ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off",
      "once", "ready", "alias", "group", "enableCookie", "disableCookie"];
    ttq.setAndDefer = function (target, method) {
      target[method] = function () {
        target.push([method].concat(Array.prototype.slice.call(arguments, 0)));
      };
    };
    for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
    ttq.load = function (key) {
      ttq._i = ttq._i || {}; ttq._i[key] = []; ttq._t = ttq._t || {};
      ttq._t[key] = +new Date(); ttq._o = ttq._o || {}; ttq._o[key] = {};
      addScript("https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=" +
        encodeURIComponent(key) + "&lib=ttq");
    };
    ttq.load(id);
    ttq.page();
  }

  /* ------------------------------------------------------------- switch -- */

  function grant() {
    gtag("consent", "update", {
      analytics_storage: "granted",
      ad_storage: "denied",             // still no advertising storage
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    startGa4();
    startMeta();
    startTiktok();
  }

  function revoke() {
    // Already-running tags cannot be unloaded, so each is told to stop through
    // its own mechanism rather than left collecting.
    gtag("consent", "update", {
      analytics_storage: "denied",
      ad_storage: "denied",
      ad_user_data: "denied",
      ad_personalization: "denied",
    });
    if (window.fbq) { try { window.fbq("consent", "revoke"); } catch (e) {} }
    if (window.ttq && window.ttq.disableCookie) {
      try { window.ttq.disableCookie(); } catch (e) {}
    }
  }

  function apply(state) {
    if (state && state.analytics) { grant(); } else { revoke(); }
  }

  window.addEventListener("billy:consent", function (event) { apply(event.detail); });

  // consent.js publishes window.billyConsent as soon as it runs, so a visitor
  // who already accepted on a previous visit is honoured without waiting for
  // another event.
  if (window.billyConsent) apply(window.billyConsent);
})();
