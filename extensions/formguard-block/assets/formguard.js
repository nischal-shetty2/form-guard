(function () {
  "use strict";

  // Blocked if the form is submitted within 2s of page load, or within 800ms of
  // the visitor's first interaction with a field. The second threshold catches
  // bots that idle on the page before filling everything instantly; 800ms is
  // well under the time any human needs to fill even a pasted message.
  var MINIMUM_TIME_MS = 2000;
  var MINIMUM_INTERACTION_MS = 800;
  var KEYWORD_CACHE_TTL_MS = 10 * 60 * 1000;

  // Deliberately generic field name. Anything containing "phone", "name", or
  // "email" gets matched by browser autofill heuristics (which ignore
  // autocomplete="off" for contact fields), which would fill the trap for real
  // customers and silently drop their message.
  var HONEYPOT_NAME = "fg_check";

  var pageLoadTime;
  // Two separate signals, because they answer different questions. sawGesture is
  // "did a human touch this page at all", which is what separates a scripted
  // submit from a real one. fieldInteractionTime is "how fast was this form
  // filled", and deliberately ignores gestures on the submit control: on a form
  // the browser restored (back navigation, session restore, autofill) the
  // visitor's only gesture is the submit click, and clocking the fill from there
  // would block every one of them.
  var sawGesture = false;
  var fieldInteractionTime = null;
  var blockedKeywords = [];
  var protectionEnabled = true;
  // The honeypot input this script created, kept so the submit check reads our
  // own node instead of looking one up by a selector a theme could also match.
  var honeypotField = null;
  var proxyUrl = "";
  var initialized = false;

  function init() {
    if (initialized) return;
    initialized = true;
    pageLoadTime = Date.now();

    var wrapper = document.getElementById("formguard-wrapper");
    if (!wrapper) return;

    proxyUrl = wrapper.getAttribute("data-proxy-url") || "";
    if (!proxyUrl) return;

    var contactForm = findContactForm();
    if (!contactForm) return;

    injectHoneypot(contactForm);
    trackInteraction(contactForm);

    // Capture phase: theme scripts usually load in <head> with defer, so a theme
    // that AJAX-submits the contact form registers its bubble-phase handler
    // before this one. stopImmediatePropagation() can't un-invoke a handler that
    // already ran, so listen in the capture phase to run first regardless.
    contactForm.addEventListener("submit", handleSubmit, true);

    // Hydrate synchronously from the per-tab cache so keyword filtering is live
    // on the very first submit, then refresh in the background. The refresh also
    // doubles as the admin dashboard's "protection is live" heartbeat, so it runs
    // even on a cache hit.
    loadCachedKeywords();
    fetchKeywords();
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  function findContactForm() {
    var idMatch =
      document.getElementById("contact_form") ||
      document.getElementById("ContactForm");
    if (idMatch && !idMatch.closest("footer")) {
      return idMatch;
    }

    var forms = document.querySelectorAll("form");
    var candidate = null;

    for (var i = 0; i < forms.length; i++) {
      var action = forms[i].getAttribute("action") || "";
      if (action.indexOf("/contact") === -1) continue;

      // Skip forms inside <footer> (typically newsletter signup forms)
      if (forms[i].closest("footer")) continue;

      // Prefer forms with an obvious message field over generic contact actions.
      if (hasMessageField(forms[i])) {
        return forms[i];
      }

      // Keep as fallback if no textarea form is found
      if (!candidate) candidate = forms[i];
    }

    if (candidate) return candidate;

    // idMatch is only still set if it was rejected above for sitting inside
    // <footer>, where it is usually a newsletter signup and guarding that
    // instead of the contact form would be worse than guarding nothing. A
    // message field is the tell: themes that put a real "contact us" block in
    // the footer have one, newsletter signups never do.
    if (idMatch && hasMessageField(idMatch)) return idMatch;

    return null;
  }

  function hasMessageField(form) {
    return !!(
      form.querySelector("textarea") ||
      form.querySelector('[name="contact[body]"]') ||
      form.querySelector('[name*="[body]"]') ||
      form.querySelector('[name*="[message]"]')
    );
  }

  function injectHoneypot(form) {
    var container = document.createElement("div");
    container.setAttribute(
      "style",
      "position:absolute;left:-9999px;top:-9999px;opacity:0;height:0;width:0;overflow:hidden;z-index:-1;"
    );
    container.setAttribute("aria-hidden", "true");
    container.setAttribute("tabindex", "-1");

    var input = document.createElement("input");
    input.setAttribute("type", "text");
    input.setAttribute("name", HONEYPOT_NAME);
    input.setAttribute("autocomplete", "off");
    input.setAttribute("tabindex", "-1");
    input.value = "";

    container.appendChild(input);
    form.appendChild(container);
    honeypotField = input;
  }

  // A gesture on the submit control tells us a human is here but nothing about
  // how long the form took to fill, so it must not start the fill clock.
  function isSubmitControl(target) {
    if (!target || typeof target.closest !== "function") return false;
    return !!target.closest(
      'button:not([type="button"]):not([type="reset"]),' +
        '[type="submit"],[type="image"]'
    );
  }

  var GESTURE_EVENTS = ["focusin", "keydown", "pointerdown", "touchstart"];

  function trackInteraction(form) {
    // Untrusted events are dispatched by script, which is exactly what these
    // gates are meant to catch, so they must not satisfy either one.

    // sawGesture only has to answer "was a human on this page at all", so it
    // listens on the document rather than the form. A theme can render the
    // submit control outside the form with form="contact_form", and then a
    // visitor whose fields the browser restored produces no event on the form
    // itself -- their message would be discarded as "nointeraction".
    var markGesture = function (e) {
      if (e.isTrusted === false) return;
      sawGesture = true;
    };

    // The fill clock stays scoped to the form, and still ignores the submit
    // control: on a restored form the visitor's only gesture is the submit
    // click, and clocking the fill from there would block every one of them.
    var markField = function (e) {
      if (e.isTrusted === false) return;
      if (fieldInteractionTime === null && !isSubmitControl(e.target)) {
        fieldInteractionTime = Date.now();
      }
    };

    for (var i = 0; i < GESTURE_EVENTS.length; i++) {
      document.addEventListener(GESTURE_EVENTS[i], markGesture, {
        capture: true,
        passive: true,
      });
      form.addEventListener(GESTURE_EVENTS[i], markField, {
        capture: true,
        passive: true,
      });
    }
  }

  function cacheKey() {
    return "fg:kw:" + proxyUrl;
  }

  function loadCachedKeywords() {
    try {
      var raw = sessionStorage.getItem(cacheKey());
      if (!raw) return;
      var cached = JSON.parse(raw);
      if (!cached || Date.now() - cached.t > KEYWORD_CACHE_TTL_MS) return;
      applyKeywords(cached.data);
    } catch (e) {
      // sessionStorage unavailable (private mode, quota) or malformed entry.
    }
  }

  function applyKeywords(data) {
    if (!data) return;
    protectionEnabled = data.enabled !== false;
    if (Array.isArray(data.keywords)) {
      blockedKeywords = data.keywords.map(function (k) {
        return String(k).toLowerCase();
      });
    }
  }

  function fetchKeywords() {
    fetch(proxyUrl + "/keywords")
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        applyKeywords(data);
        try {
          sessionStorage.setItem(
            cacheKey(),
            JSON.stringify({ t: Date.now(), data: data })
          );
        } catch (e) {
          // Cache write is best-effort; detection works without it.
        }
      })
      .catch(function () {
        // Keywords fetch failed — honeypot + time checks still active
      });
  }

  function handleSubmit(e) {
    if (!protectionEnabled) return;

    // Fail open. This runs in the capture phase on a real customer's message, so
    // an unexpected throw here must not be the reason their form misbehaves.
    // The whole body is wrapped, not just the check: showBlockedMessage and
    // sendEvent run after preventDefault, and a throw there would leave the
    // submission blocked with nothing shown and nothing recorded.
    //
    // currentTarget, not target: submit events bubble, so a nested form injected
    // by another script would otherwise be the one we judge.
    var reported = false;
    try {
      var spamReason = checkForSpam(e.currentTarget);

      if (spamReason) {
        e.preventDefault();
        e.stopImmediatePropagation();
        // Record before rendering. The DOM write is the part that can throw, and
        // a block nobody counted is worse than a block nobody saw.
        sendEvent(true, spamReason);
        reported = true;
        showBlockedMessage(e.currentTarget);
        return;
      }

      sendEvent(false, "valid");
      reported = true;
    } catch (err) {
      // Swallowing this would hide a permanently broken check behind a dashboard
      // that still reports protection as live, so leave a trace in both places.
      if (typeof console !== "undefined" && console.warn) {
        console.warn("FormGuard: submit check failed", err);
      }
      if (!reported) sendEvent(false, "unknown");
    }
  }

  function checkForSpam(form) {
    // Read the node injectHoneypot created. Looking it up by a fixed id meant a
    // theme or another app rendering an element that collided with it won the
    // lookup: if that element had no .value we threw on undefined.length, and if
    // it had one, every real customer's message was discarded as "honeypot".
    if (honeypotField && honeypotField.value) {
      return "honeypot";
    }

    // A human cannot reach a submit without focusing, typing, or pointing at
    // something first, so zero recorded gestures means the submit was scripted.
    if (!sawGesture) {
      return "nointeraction";
    }

    if (Date.now() - pageLoadTime < MINIMUM_TIME_MS) {
      return "time";
    }

    // Null when the submit control was the visitor's only gesture, which is the
    // normal shape of a restored or autofilled form. There is no fill duration
    // to judge in that case, so fall through to the keyword check.
    if (
      fieldInteractionTime !== null &&
      Date.now() - fieldInteractionTime < MINIMUM_INTERACTION_MS
    ) {
      return "time";
    }

    if (blockedKeywords.length > 0) {
      var formText = visitorText(form);

      for (var i = 0; i < blockedKeywords.length; i++) {
        var kw = blockedKeywords[i];
        var matched;
        if (/^[a-z0-9]+$/.test(kw)) {
          // Plain word: match on word boundaries so "cialis" doesn't trip on
          // "specialist".
          matched = new RegExp("\\b" + escapeRegex(kw) + "\\b").test(formText);
        } else {
          // Phrase, email, or anything with symbols: match anywhere, since
          // word boundaries are unreliable around "@", ".", spaces, etc.
          matched = formText.indexOf(kw) !== -1;
        }
        if (matched) {
          return "keyword:" + kw;
        }
      }
    }

    return null;
  }

  // Input types the visitor types into. Everything else on a contact form
  // carries a value the theme chose, not one the customer wrote: select options,
  // checkbox and radio values, and the submit control's label.
  var SCANNED_INPUT_TYPES = [
    "text",
    "email",
    "tel",
    "url",
    "search",
    "number",
  ];

  // Only the text a customer actually typed. Scanning the whole FormData swept
  // in the theme's hidden inputs too -- form_type and utf8 on every Shopify
  // contact form, plus whatever a theme adds (shop domain, return_to path, page
  // handle). A merchant who blocked their own brand name to stop impersonation
  // spam would then match a hidden value on every real submission and lose the
  // lot. form.elements rather than a query on the form so a field the theme
  // renders outside it with form="contact_form" is still read.
  function visitorText(form) {
    var fields = form.elements;
    var text = "";

    for (var i = 0; i < fields.length; i++) {
      var field = fields[i];
      if (field === honeypotField) continue;
      // form.elements includes disabled controls, unlike FormData. Their values
      // are never submitted, so matching a blocklist against one would block a
      // message over text the customer never sent.
      if (field.disabled) continue;

      if (field.tagName === "INPUT") {
        // An input with no type attribute is a text input.
        var type = (field.getAttribute("type") || "text").toLowerCase();
        if (SCANNED_INPUT_TYPES.indexOf(type) === -1) continue;
      } else if (field.tagName !== "TEXTAREA") {
        continue;
      }

      if (typeof field.value === "string" && field.value) {
        text += " " + field.value.toLowerCase();
      }
    }

    return text;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function showBlockedMessage(form) {
    var existing = form.parentNode.querySelector(".formguard-blocked-msg");
    if (existing) existing.remove();

    var msg = document.createElement("div");
    msg.className = "formguard-blocked-msg";
    // role=alert so the rejection is announced; without it a screen reader user
    // gets no feedback that the submit went nowhere.
    msg.setAttribute("role", "alert");
    msg.setAttribute(
      "style",
      "padding:12px 16px;margin:12px 0;background:#fef3cd;border:1px solid #ffc107;border-radius:4px;color:#856404;font-size:14px;"
    );
    msg.textContent =
      "Your message could not be sent. Please review your submission and try again.";

    form.parentNode.insertBefore(msg, form.nextSibling);

    if (typeof msg.scrollIntoView === "function") {
      msg.scrollIntoView({ block: "nearest" });
    }

    setTimeout(function () {
      if (msg.parentNode) msg.remove();
    }, 5000);
  }

  function sendEvent(isSpam, reason) {
    var url =
      proxyUrl +
      "/event?isSpam=" +
      (isSpam ? "1" : "0") +
      "&reason=" +
      encodeURIComponent(reason);

    if (typeof fetch === "function") {
      fetch(url, { keepalive: true }).catch(function () {});
    } else {
      new Image().src = url;
    }
  }
})();
