import { CHAMPIONS, CHAMPION_IDS, SKILL_FX } from '../shared/moba/champions.js';
import { REGISTRY } from '../src/three/fx/skills/index.js';

const slots = ['q', 'w', 'e', 'r'];
const styleText = (style) => {
  if (typeof style === 'string') return style;
  if (style && typeof style === 'object') {
    return Object.entries(style).map(([variant, key]) => `${variant}:${key}`).join(', ');
  }
  return 'missing';
};

const rows = CHAMPION_IDS.map((id) => {
  const champion = CHAMPIONS[id];
  const icons = slots.map((slot) => {
    const skill = champion.skills?.[slot];
    if (!skill) return 'missing';
    return skill.iconKey
      ? `SVG* (${skill.iconKey}; ${skill.icon || 'no fallback'})`
      : skill.icon || 'missing';
  });
  const styles = slots.map((slot) => styleText(SKILL_FX[id]?.[slot]));
  const handlers = slots.map((slot) => {
    const handler = REGISTRY[id]?.[slot];
    return handler && (typeof handler.cast === 'function' || typeof handler.land === 'function') ? slot.toUpperCase() : null;
  });
  return {
    name: champion.name || id,
    icons: icons.join(' / '),
    styles: styles.join(' / '),
    handlers: handlers.every(Boolean) ? `${handlers.length}/4` : `${handlers.filter(Boolean).join(', ')} (others fallback)`,
  };
});

const skillCount = CHAMPION_IDS.length * slots.length;
const iconKeyCount = CHAMPION_IDS.reduce((n, id) => n + slots.filter((slot) => CHAMPIONS[id].skills?.[slot]?.iconKey).length, 0);
const styleCount = CHAMPION_IDS.reduce((n, id) => n + slots.filter((slot) => SKILL_FX[id]?.[slot] != null).length, 0);
const handlerCount = CHAMPION_IDS.reduce((n, id) => n + slots.filter((slot) => {
  const handler = REGISTRY[id]?.[slot];
  return handler && (typeof handler.cast === 'function' || typeof handler.land === 'function');
}).length, 0);

console.log(`Snapshot: ${CHAMPION_IDS.length} champions, ${skillCount} QWER skills, ${iconKeyCount} icon-key assets, ${skillCount - iconKeyCount} emoji icon fallbacks, ${styleCount} 2D style keys, ${handlerCount} 3D per-skill handlers.`);
console.log('| Champion | Q/W/E/R icons | 2D style keys (Q/W/E/R) | 3D code handlers |');
console.log('|---|---|---|---|');
for (const row of rows) console.log(`| ${row.name} | ${row.icons} | ${row.styles} | ${row.handlers} |`);
