// Maps the bare specifiers 'three' and 'three/addons/' to the vendored r160 copy (no CDN, works offline).
// Usage: `import { ensureImportMap } from './vendor/importmap.js'; await ensureImportMap();` BEFORE importing
// any module that does `import ... from 'three'`. Injecting a <script type="importmap"> after other modules
// have loaded is honoured only by newer browsers; if a browser ignores it, ensureImportMap() throws a clear
// error. Fallback for those: paste IMPORTMAP_HTML into index.html <head> before the module <script>.
const base = new URL('./', import.meta.url).href;
export const IMPORTMAP = { imports: { three: base + 'three.module.js', 'three/addons/': base + 'addons/' } };
export const IMPORTMAP_HTML = '<script type="importmap">' + JSON.stringify(IMPORTMAP) + '<\/script>';

export function ensureImportMap() {
  let ok = false;
  try { ok = import.meta.resolve && new URL(import.meta.resolve('three')).href === IMPORTMAP.imports.three; } catch (_) { /* unresolved */ }
  if (ok) return;
  const s = document.createElement('script');
  s.type = 'importmap';
  s.textContent = JSON.stringify(IMPORTMAP);
  document.head.appendChild(s);
}
