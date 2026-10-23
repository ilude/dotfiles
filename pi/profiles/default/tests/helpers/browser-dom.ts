import { createRequire } from "node:module";

// Existing jsdom dependency supplies selector/native-setter semantics. Layout is
// synthetic: finite tests do not claim Chromium rendering or live browser coverage.
const { JSDOM } = createRequire(import.meta.url)("jsdom") as {
  JSDOM: new (html: string, options: { url: string; runScripts: string }) => { window: Window & typeof globalThis };
};
export function browserDom(html: string) {
  const { window } = new JSDOM(html, { url: "https://account.example/login", runScripts: "outside-only" });
  Object.defineProperty(window, "CSS", { value: { escape: (value: string) => value.replace(/[^a-zA-Z0-9_-]/g, char => `\\${char}`) } });
  Object.defineProperty(window.Element.prototype, "getClientRects", { value(this: Element) {
    let current: Element | null = this;
    while (current) { if (window.getComputedStyle(current).display === "none") return []; current = current.parentElement; }
    return [{}];
  } });
  return { window, evaluate: (expression: string): unknown => window.eval(expression) };
}

/** Synthetic layout and instant clamped scrolling, not jsdom/Chromium layout. */
export function scrollBox(element: Element, width = 300, height = 200, scrollWidth = width, scrollHeight = 1000) {
  let x = 0, y = 0;
  const rtl = (element as HTMLElement).style.direction === "rtl";
  Object.defineProperties(element, {
    clientWidth: { configurable: true, value: width }, clientHeight: { configurable: true, value: height },
    clientLeft: { configurable: true, value: 0 }, clientTop: { configurable: true, value: 0 },
    scrollWidth: { configurable: true, value: scrollWidth }, scrollHeight: { configurable: true, value: scrollHeight },
    scrollLeft: { configurable: true, get: () => x, set: (value: number) => { x = Math.max(rtl ? width - scrollWidth : 0, Math.min(rtl ? 0 : scrollWidth - width, value)); } },
    scrollTop: { configurable: true, get: () => y, set: (value: number) => { y = Math.max(0, Math.min(scrollHeight - height, value)); } },
    scrollTo: { configurable: true, value: ({ left, top }: ScrollToOptions) => { if (left !== undefined) element.scrollLeft = left; if (top !== undefined) element.scrollTop = top; } },
  });
  return element as HTMLElement;
}
