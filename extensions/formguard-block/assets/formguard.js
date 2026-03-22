(function () {
  "use strict";

  var MINIMUM_TIME_MS = 2000;
  var pageLoadTime;
  var blockedKeywords = [];
  var protectionEnabled = true;
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
    contactForm.addEventListener("submit", handleSubmit);

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

    return idMatch || candidate;
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
    input.setAttribute("name", "fgphone");
    input.setAttribute("id", "fgphone");
    input.setAttribute("autocomplete", "off");
    input.setAttribute("tabindex", "-1");
    input.value = "";

    container.appendChild(input);
    form.appendChild(container);
  }

  function fetchKeywords() {
    fetch(proxyUrl + "/keywords")
      .then(function (res) {
        return res.json();
      })
      .then(function (data) {
        if (data.enabled === false) {
          protectionEnabled = false;
        }
        if (Array.isArray(data.keywords)) {
          blockedKeywords = data.keywords.map(function (k) {
            return k.toLowerCase();
          });
        }
      })
      .catch(function () {
        // Keywords fetch failed — honeypot + time checks still active
      });
  }

  function handleSubmit(e) {
    if (!protectionEnabled) return;

    var spamReason = checkForSpam(e.target);

    if (spamReason) {
      e.preventDefault();
      e.stopImmediatePropagation();
      showBlockedMessage(e.target);
      sendEvent(true, spamReason);
      return false;
    }

    sendEvent(false, "valid");
  }

  function checkForSpam(form) {
    var honeypot = form.querySelector("#fgphone");
    if (honeypot && honeypot.value.length > 0) {
      return "honeypot";
    }

    var elapsed = Date.now() - pageLoadTime;
    if (elapsed < MINIMUM_TIME_MS) {
      return "time";
    }

    if (blockedKeywords.length > 0) {
      var formData = new FormData(form);
      var formText = "";
      formData.forEach(function (value) {
        if (typeof value === "string") {
          formText += " " + value.toLowerCase();
        }
      });

      for (var i = 0; i < blockedKeywords.length; i++) {
        var pattern = new RegExp(
          "\\b" + escapeRegex(blockedKeywords[i]) + "\\b"
        );
        if (pattern.test(formText)) {
          return "keyword:" + blockedKeywords[i];
        }
      }
    }

    return null;
  }

  function escapeRegex(str) {
    return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  }

  function showBlockedMessage(form) {
    var existing = form.parentNode.querySelector(".formguard-blocked-msg");
    if (existing) existing.remove();

    var msg = document.createElement("div");
    msg.className = "formguard-blocked-msg";
    msg.setAttribute(
      "style",
      "padding:12px 16px;margin:12px 0;background:#fef3cd;border:1px solid #ffc107;border-radius:4px;color:#856404;font-size:14px;"
    );
    msg.textContent =
      "Your message could not be sent. Please review your submission and try again.";

    form.parentNode.insertBefore(msg, form.nextSibling);

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
