import type { Api } from '../../preload/index';
import { createDemoApi } from './demo/demo-api';

declare global {
  interface Window {
    api: Api;
  }
}

// Inside Electron the preload provides window.api. In a plain browser (the
// GitHub Pages demo) it is absent, and the demo shim stands in with a
// client-side engine seeded with sample data.
/** True in the browser demo (GitHub Pages); Electron always provides window.api. */
export const isDemo = !window.api;

export const api: Api = window.api ?? createDemoApi();
