import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterEach } from "vitest";

afterEach(() => {
  cleanup();
});

// jsdom no trae ResizeObserver y las gráficas lo usan para medirse.
globalThis.ResizeObserver ??= class {
  observe() {
    // Sin diseño real no hay nada que observar.
  }
  unobserve() {
    // Ídem.
  }
  disconnect() {
    // Ídem.
  }
};
