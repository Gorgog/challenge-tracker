import '@testing-library/jest-dom/vitest'

/* Radix меряет бегунок ползунка через ResizeObserver, а в jsdom его нет. */
if (!('ResizeObserver' in globalThis)) {
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
}
