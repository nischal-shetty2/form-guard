/**
 * End-to-end test for the storefront embed, run against the real asset in a
 * stubbed DOM: `node test/storefront.js [path-to-formguard.js]`
 *
 * It exists because `node --check`, eslint, and unit-testing functions pulled
 * out of the file all passed while detection was completely dead in production.
 * init() was calling trackInteraction above the line that assigns
 * GESTURE_EVENTS, so it threw on undefined.length on every page load, before
 * the submit listener was attached. Nothing that inspects the file rather than
 * running it can catch that, and it had already happened once before with
 * HONEYPOT_NAME.
 *
 * So this drives the script the way a browser does: evaluate it, let it find
 * the form, then dispatch real gestures and a submit through the listeners it
 * registered, and assert on the event it reports back.
 */
import fs from "node:fs";
import vm from "node:vm";
import process from "node:process";
import { setImmediate } from "node:timers";

// fetchKeywords chains fetch -> res.json() -> applyKeywords, so a couple of
// microtask ticks is not enough to be sure the list has landed. setImmediate
// runs after the microtask queue is fully drained.
const settle = () => new Promise((resolve) => setImmediate(resolve));

const ASSET =
  process.argv[2] || "extensions/formguard-block/assets/formguard.js";
const src = fs.readFileSync(ASSET, "utf8");

let failures = 0;
function check(name, ok, detail) {
  if (!ok) failures++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${ok || !detail ? "" : ` -- ${detail}`}`);
}

function node(tag, props) {
  const el = Object.assign(
    {
      tagName: tag,
      value: "",
      _listeners: {},
      setAttribute() {},
      getAttribute: () => null,
      appendChild() {},
      insertBefore() {},
      remove() {},
      closest: () => null,
      querySelector: () => null,
      querySelectorAll: () => [],
      scrollIntoView() {},
      addEventListener(type, fn) {
        (this._listeners[type] = this._listeners[type] || []).push(fn);
      },
      removeEventListener() {},
      fire(type, event) {
        (this._listeners[type] || []).forEach((fn) => fn(event));
      },
    },
    props || {}
  );
  return el;
}

function input(type, value, extra) {
  return node("INPUT", {
    value,
    getAttribute: (n) => (n === "type" ? type : null),
    ...extra,
  });
}

/**
 * Boots the script against a fresh stubbed page and returns handles for driving
 * it. `keywords` is what the /keywords endpoint answers with.
 */
function boot({ fields, keywords = [], enabled = true, readyState = "interactive" }) {
  let clock = 1_000_000;
  const events = [];
  let evalError = null;

  const textarea = fields.find((f) => f.tagName === "TEXTAREA");
  const form = node("FORM", {
    getAttribute: (n) => (n === "action" ? "/contact#ContactForm" : null),
    querySelector: (s) => (s === "textarea" ? textarea || null : null),
    elements: fields,
    parentNode: node("DIV", { querySelector: () => null }),
  });
  fields.forEach((f) => (f.form = form));

  const wrapper = node("DIV", {
    getAttribute: (n) => (n === "data-proxy-url" ? "/apps/formguard" : null),
  });

  const document = node("DOCUMENT", {
    readyState,
    getElementById: (id) =>
      id === "formguard-wrapper" ? wrapper : id === "contact_form" ? form : null,
    querySelectorAll: () => [form],
    createElement: (tag) => node(tag.toUpperCase()),
  });

  const sandbox = {
    document,
    console,
    JSON,
    Math,
    String,
    Array,
    RegExp,
    Date: { now: () => clock },
    sessionStorage: { getItem: () => null, setItem() {} },
    setTimeout: () => 0,
    FormData: class {},
    Image: class {},
    fetch: (url) => {
      // /event is fire-and-forget telemetry; record it as the verdict.
      if (url.indexOf("/event") !== -1) {
        events.push(url);
        return Promise.resolve({ json: () => Promise.resolve({}) });
      }
      return Promise.resolve({
        json: () => Promise.resolve({ enabled, keywords }),
      });
    },
  };
  sandbox.window = sandbox;

  try {
    vm.createContext(sandbox);
    vm.runInContext(src, sandbox);
  } catch (err) {
    evalError = err;
  }

  return {
    evalError,
    form,
    document,
    events,
    fireDomReady: () => document.fire("DOMContentLoaded", {}),
    gesture: (type = "focusin", target = textarea) =>
      // Gestures land on the document (presence) and the form (fill clock).
      [document, form].forEach((n) => n.fire(type, { isTrusted: true, target })),
    advance: (ms) => (clock += ms),
    submit: () => {
      const event = {
        currentTarget: form,
        target: form,
        isTrusted: true,
        prevented: false,
        preventDefault() {
          this.prevented = true;
        },
        stopImmediatePropagation() {},
      };
      form.fire("submit", event);
      return event;
    },
    // "keyword:blabla" out of ...&reason=keyword%3Ablabla
    lastReason: () => {
      const url = events[events.length - 1];
      if (!url) return null;
      return decodeURIComponent(url.split("reason=")[1] || "");
    },
  };
}

const CONTACT_FIELDS = () => [
  input("hidden", "contact"), // form_type, on every Shopify contact form
  input("hidden", "acme-brand.myshopify.com"), // theme-added
  input("text", "Nischal Shetty"),
  input("email", "nischal@example.com"),
  input("tel", "7019647387"),
  node("TEXTAREA", { value: "" }),
];

function withComment(text) {
  const fields = CONTACT_FIELDS();
  fields[fields.length - 1].value = text;
  return fields;
}

// --- the regression that shipped: script-level throw kills everything --------

for (const readyState of ["interactive", "loading"]) {
  const page = boot({ fields: withComment("hello"), readyState });
  if (readyState === "loading") page.fireDomReady();

  check(
    `[${readyState}] script evaluates without throwing`,
    !page.evalError,
    page.evalError && `${page.evalError.constructor.name}: ${page.evalError.message}`
  );
  check(
    `[${readyState}] submit listener attached`,
    (page.form._listeners.submit || []).length === 1
  );
  check(
    `[${readyState}] gesture listeners attached`,
    ["focusin", "keydown", "pointerdown", "touchstart"].every(
      (t) => (page.form._listeners[t] || []).length === 1
    )
  );
}

// --- detection behaviour, driven through the listeners it registered ---------

async function scenario(name, setup, expected) {
  const page = boot(setup);
  await settle(); // let fetchKeywords land
  if (setup.gesture !== false) page.gesture();
  page.advance(5000); // clear the page-load and fill-time floors
  const event = page.submit();
  check(
    name,
    page.lastReason() === expected.reason && event.prevented === expected.blocked,
    `got reason=${page.lastReason()} blocked=${event.prevented}, wanted reason=${expected.reason} blocked=${expected.blocked}`
  );
}

(async () => {
  await scenario(
    "clean message passes",
    { fields: withComment("hello, question about my order"), keywords: ["blabla"] },
    { reason: "valid", blocked: false }
  );

  await scenario(
    "blocked keyword in the comment is caught",
    { fields: withComment("blabla"), keywords: ["blabla"] },
    { reason: "keyword:blabla", blocked: true }
  );

  await scenario(
    "phrase keyword is caught",
    { fields: withComment("please buy now ok"), keywords: ["buy now"] },
    { reason: "keyword:buy now", blocked: true }
  );

  await scenario(
    "word-boundary keyword does not fire on a substring",
    { fields: withComment("ask our specialist"), keywords: ["cialis"] },
    { reason: "valid", blocked: false }
  );

  // The bug fixed in #10: hidden fields used to be scanned, so a merchant
  // blocking their own brand name lost every real message.
  await scenario(
    "keyword matching a hidden field value does not block",
    { fields: withComment("normal message"), keywords: ["acme-brand"] },
    { reason: "valid", blocked: false }
  );

  await scenario(
    "form_type=contact does not trip the keyword 'contact'",
    { fields: withComment("normal message"), keywords: ["contact"] },
    { reason: "valid", blocked: false }
  );

  await scenario(
    "submit with no gesture at all is scripted",
    { fields: withComment("hello"), keywords: [], gesture: false },
    { reason: "nointeraction", blocked: true }
  );

  // Protection off in the admin means the handler returns before any check.
  const off = boot({ fields: withComment("blabla"), keywords: ["blabla"], enabled: false });
  await settle();
  off.gesture();
  off.advance(5000);
  const offEvent = off.submit();
  check(
    "disabled protection reports nothing and blocks nothing",
    off.events.length === 0 && offEvent.prevented === false,
    `events=${off.events.length} blocked=${offEvent.prevented}`
  );

  console.log(
    failures ? `\n${failures} failing` : "\nall pass"
  );
  process.exit(failures ? 1 : 0);
})();
