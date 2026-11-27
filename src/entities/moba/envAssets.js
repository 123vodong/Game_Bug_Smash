// envAssets — loading + canvas helpers for the Team Mode environment art (CC0 textures / sprites,
// see assets/moba/map/LICENSE.txt and assets/moba/units/LICENSE.txt).
//   preloadEnvAssets(scene)  — call from a Scene preload() (MobaMap.preload does it)
//   setEnvImages(scene)      — publish the loaded images to the canvas painters (call before baking)
//   texPattern(ctx, key, tint, scale) — tiled, tinted CanvasPattern in world units (null when missing)
//   drawSprite(ctx, name, cx, baseY, w, opts) — draw an atlas frame onto a 2D canvas
const MAP = 'assets/moba/map/';
const UNITS = 'assets/moba/units/';
const TEX = ['floor', 'carpet', 'riverbed', 'moss', 'grass', 'plate', 'base', 'plaster', 'wood', 'leaves'];

export function preloadEnvAssets(scene) {
  const L = scene.load;
  for (const t of TEX) if (!scene.textures.exists(`env-${t}`)) L.image(`env-${t}`, `${MAP}${t}.jpg`);
  if (!scene.textures.exists('env-flow')) L.image('env-flow', `${MAP}flow.png`);
  if (!scene.textures.exists('env-props')) L.atlas('env-props', `${MAP}props.png`, `${MAP}props.json`);
  if (!scene.textures.exists('env-structs')) L.atlas('env-structs', `${UNITS}structs.png`, `${UNITS}structs.json`);
  if (!scene.textures.exists('env-units')) L.atlas('env-units', `${UNITS}units.png`, `${UNITS}units.json`);
}

/** Loaded images, shared with the pure canvas painters (walls / bushes) which have no scene handle. */
export const ENV = { ready: false, img: {}, frames: null, tinted: new Map() };

export function setEnvImages(scene) {
  const T = scene.textures;
  ENV.img = {};
  for (const t of TEX) if (T.exists(`env-${t}`)) ENV.img[t] = T.get(`env-${t}`).getSourceImage();
  if (T.exists('env-props')) {
    const tx = T.get('env-props');
    ENV.props = tx.getSourceImage();
    ENV.frames = {};
    for (const n of tx.getFrameNames()) { const f = tx.get(n); ENV.frames[n] = { x: f.cutX, y: f.cutY, w: f.cutWidth, h: f.cutHeight }; }
  }
  ENV.ready = !!ENV.img.floor && !!ENV.frames;
  return ENV.ready;
}

/** Tinted (multiply) copy of a texture, cached. tint = 0xRRGGBB, mix = 0..1 how strongly the tint applies. */
function tintedCanvas(key, tint, mix = 1) {
  const id = `${key}|${tint}|${mix}`;
  let c = ENV.tinted.get(id);
  if (c) return c;
  const img = ENV.img[key];
  if (!img) return null;
  c = document.createElement('canvas'); c.width = img.width; c.height = img.height;
  const x = c.getContext('2d');
  x.drawImage(img, 0, 0);
  if (tint != null && tint !== 0xffffff) {
    x.globalCompositeOperation = 'multiply';
    const r = (tint >> 16) & 255, g = (tint >> 8) & 255, b = tint & 255;
    x.fillStyle = `rgb(${Math.round(255 + (r - 255) * mix)},${Math.round(255 + (g - 255) * mix)},${Math.round(255 + (b - 255) * mix)})`;
    x.fillRect(0, 0, c.width, c.height);
  }
  ENV.tinted.set(id, c);
  return c;
}

/** Repeating pattern of `key` tinted by `tint`; one texel = `scale` world units. */
export function texPattern(ctx, key, tint = 0xffffff, scale = 1, mix = 1) {
  const c = tintedCanvas(key, tint, mix);
  if (!c) return null;
  const p = ctx.createPattern(c, 'repeat');
  if (p && p.setTransform && typeof DOMMatrix !== 'undefined') p.setTransform(new DOMMatrix().scale(scale));
  return p;
}

/** Draw atlas frame `name` (from env-props) with its bottom-centre at (cx, baseY), `w` world px wide. */
export function drawSprite(ctx, name, cx, baseY, w, o = {}) {
  const f = ENV.frames?.[name];
  if (!f || !ENV.props) return false;
  const h = (w * f.h) / f.w;
  ctx.save();
  if (o.alpha != null) ctx.globalAlpha = o.alpha;
  if (o.flip) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
  ctx.drawImage(o.src || ENV.props, f.x, f.y, f.w, f.h, cx - w / 2, baseY - h, w, h);
  ctx.restore();
  return true;
}

/** Pre-shaded copy of a props frame (multiply tint + vertical shade), cached as a canvas used as `o.src`-like source. */
export function shadedSprite(name, tint, shade = 0.35) {
  const id = `spr|${name}|${tint}|${shade}`;
  let c = ENV.tinted.get(id);
  if (c) return c;
  const f = ENV.frames?.[name];
  if (!f) return null;
  c = document.createElement('canvas'); c.width = f.w; c.height = f.h;
  const x = c.getContext('2d');
  x.drawImage(ENV.props, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  x.globalCompositeOperation = 'multiply';
  const r = (tint >> 16) & 255, g = (tint >> 8) & 255, b = tint & 255;
  x.fillStyle = `rgb(${r},${g},${b})`; x.fillRect(0, 0, f.w, f.h);
  const gr = x.createLinearGradient(0, 0, 0, f.h);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(1, `rgba(${255 * (1 - shade) | 0},${255 * (1 - shade) | 0},${255 * (1 - shade) | 0},1)`);
  x.fillStyle = gr; x.fillRect(0, 0, f.w, f.h);
  x.globalCompositeOperation = 'destination-in';
  x.drawImage(ENV.props, f.x, f.y, f.w, f.h, 0, 0, f.w, f.h);
  ENV.tinted.set(id, c);
  return c;
}
/** drawSprite for a shaded canvas made by shadedSprite (whole canvas is the frame). */
export function drawShaded(ctx, c, cx, baseY, w, flip = false) {
  if (!c) return false;
  const h = (w * c.height) / c.width;
  ctx.save();
  if (flip) { ctx.translate(cx, 0); ctx.scale(-1, 1); ctx.translate(-cx, 0); }
  ctx.drawImage(c, cx - w / 2, baseY - h, w, h);
  ctx.restore();
  return true;
}
