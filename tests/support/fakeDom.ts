/**
 * DOM minimale per eseguire lo script client dello slot pubblicitario in Node:
 * IntersectionObserver, timer, visibilità della scheda e pagehide sono controllati dal test.
 */

interface Timer {
  at: number;
  fn: () => void;
}

export function runSlotScript(source: string, attrs: Record<string, string> = { "data-ad-placement": "p1", "data-ad-token": "tok" }) {
  let now = 0;
  let seq = 0;
  const timers = new Map<number, Timer>();
  const beacons: { url: string; body: string; at: number }[] = [];
  const docListeners: Record<string, Array<() => void>> = {};
  const winListeners: Record<string, Array<() => void>> = {};
  let ioCallback: ((entries: { isIntersecting: boolean; intersectionRatio: number }[]) => void) | null = null;
  let observed = false;

  const slot = { getAttribute: (n: string) => attrs[n] ?? null };
  const doc = {
    visibilityState: "visible",
    currentScript: { closest: (sel: string) => (sel === "[data-ad-slot]" ? slot : null) },
    addEventListener: (t: string, f: () => void) => (docListeners[t] ??= []).push(f),
    removeEventListener: (t: string, f: () => void) => (docListeners[t] = (docListeners[t] ?? []).filter((x) => x !== f)),
  };
  class IO {
    constructor(cb: typeof ioCallback) {
      ioCallback = cb;
    }
    observe() {
      observed = true;
    }
    disconnect() {
      ioCallback = null;
    }
  }
  const setTimeoutFake = (fn: () => void, ms: number) => {
    timers.set(++seq, { at: now + ms, fn });
    return seq;
  };
  const clearTimeoutFake = (id: number) => void timers.delete(id);
  const win = {
    IntersectionObserver: IO,
    setTimeout: setTimeoutFake,
    clearTimeout: clearTimeoutFake,
    addEventListener: (t: string, f: () => void) => (winListeners[t] ??= []).push(f),
    removeEventListener: (t: string, f: () => void) => (winListeners[t] = (winListeners[t] ?? []).filter((x) => x !== f)),
  };
  const nav = { sendBeacon: (url: string, body: string) => (beacons.push({ url, body, at: now }), true) };

  new Function("window", "document", "navigator", "IntersectionObserver", "setTimeout", "clearTimeout", source)(
    win,
    doc,
    nav,
    IO,
    setTimeoutFake,
    clearTimeoutFake,
  );

  return {
    beacons,
    observed: () => observed,
    pendingTimers: () => timers.size,
    listenerCount: () => (docListeners.visibilitychange ?? []).length + (winListeners.pagehide ?? []).length,
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const due = [...timers].filter(([, t]) => t.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
        if (!due) break;
        now = due[1].at;
        timers.delete(due[0]);
        due[1].fn();
      }
      now = end;
    },
    see(ratio: number) {
      ioCallback?.([{ isIntersecting: ratio > 0, intersectionRatio: ratio }]);
    },
    hideTab() {
      doc.visibilityState = "hidden";
      (docListeners.visibilitychange ?? []).forEach((f) => f());
    },
    showTab() {
      doc.visibilityState = "visible";
      (docListeners.visibilitychange ?? []).forEach((f) => f());
    },
    pagehide() {
      (winListeners.pagehide ?? []).forEach((f) => f());
    },
  };
}
