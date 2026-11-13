import { PHRASES } from "@/lib/translations";
import { DZ_PHRASES } from "@/lib/translations-dz";
import type { Lang } from "@/lib/i18n";

/**
 * Translates the Arabic text the screens render into French/English, in the
 * browser only. It watches the page, so new screens, toasts and dialogs are
 * translated too. Arabic stays the source text; switching back restores it.
 */
const AR = /[\u0600-\u06FF]/;
const ATTRS = ["placeholder", "title", "aria-label"] as const;
const keys = Object.keys(PHRASES).sort((a, b) => b.length - a.length);
const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const re = new RegExp(`(?<![\\u0600-\\u06FF])(${keys.map(esc).join("|")})(?![\\u0600-\\u06FF])`, "g");

let lang: Lang = "ar";
const textOrig = new WeakMap<Text, { orig: string; out: string }>();
const attrOrig = new WeakMap<Element, Record<string, { orig: string; out: string }>>();

const dzKeys = Object.keys(DZ_PHRASES).sort((a, b) => b.length - a.length);
const dzRe = new RegExp(`(?<![\\u0600-\\u06FF])(${dzKeys.map(esc).join("|")})(?![\\u0600-\\u06FF])`, "g");

export function translateString(src: string, l: Lang = lang): string {
  if (l === "ar" || !AR.test(src)) return src;
  if (l === "dz") return src.replace(dzRe, (m) => DZ_PHRASES[m] ?? m);
  const i = l === "fr" ? 0 : 1;
  const trimmed = src.trim();
  const exact = PHRASES[trimmed];
  if (exact) return src.replace(trimmed, exact[i]);
  return src.replace(re, (m) => PHRASES[m]?.[i] ?? m);
}

function doText(n: Text) {
  const v = n.nodeValue ?? "";
  const rec = textOrig.get(n);
  const orig = rec && v === rec.out ? rec.orig : v;
  if (!AR.test(orig)) return;
  const out = translateString(orig);
  textOrig.set(n, { orig, out });
  if (v !== out) n.nodeValue = out;
}
function doAttrs(el: Element) {
  for (const a of ATTRS) {
    const v = el.getAttribute(a);
    if (v == null) continue;
    const map = attrOrig.get(el) ?? {};
    const rec = map[a];
    const orig = rec && v === rec.out ? rec.orig : v;
    if (!AR.test(orig)) continue;
    const out = translateString(orig);
    map[a] = { orig, out };
    attrOrig.set(el, map);
    if (v !== out) el.setAttribute(a, out);
  }
}
function walk(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) return doText(root as Text);
  if (root.nodeType !== Node.ELEMENT_NODE) return;
  const el = root as Element;
  if (el.tagName === "SCRIPT" || el.tagName === "STYLE") return;
  if (el.closest("[data-no-translate]")) return;
  doAttrs(el);
  el.querySelectorAll("*").forEach((c) => doAttrs(c));
  const tw = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
  let t: Node | null;
  while ((t = tw.nextNode())) {
    const p = t.parentElement;
    if (p && (p.tagName === "SCRIPT" || p.tagName === "STYLE" || p.closest("[data-no-translate]"))) continue;
    doText(t as Text);
  }
}

let observer: MutationObserver | null = null;
let ready = false;
/** Wait until the server-rendered page has finished hydrating before touching its text. */
function whenHydrated(fn: () => void) {
  const idle = () => (window.requestIdleCallback ?? ((f: () => void) => setTimeout(f, 200)))(() => setTimeout(fn, 150));
  if (document.readyState === "complete") idle();
  else window.addEventListener("load", idle, { once: true });
}

export function setPageLanguage(l: Lang) {
  lang = l;
  if (typeof document === "undefined") return;
  if (!ready) {
    if (l === "ar") return;
    ready = true;
    return whenHydrated(() => start());
  }
  start();
}

function start() {
  if (!observer) {
    observer = new MutationObserver((muts) => {
      for (const m of muts) {
        if (m.type === "characterData") doText(m.target as Text);
        else if (m.type === "attributes") doAttrs(m.target as Element);
        else m.addedNodes.forEach(walk);
      }
    });
    observer.observe(document.documentElement, {
      subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: [...ATTRS],
    });
  }
  walk(document.documentElement);
}
