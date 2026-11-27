// Summoner spells (D / F). cast(k,m): m = {sid, spell, x0,y0,x1,y1}. Return true to replace the generic spell effect.
export default {
  flash: { cast(k, m) { // Alt+Tab: window-flip chevrons from -> to
    if (Number.isFinite(m.x1)) { const a = Math.atan2(m.y1 - m.y0, m.x1 - m.x0); k.chev(m.x0, m.y0, a, 0xffe066, 3, 70, 50, 0.35); k.ring(m.x0, m.y0, 70, 0xffe066, 0.35); k.ring(m.x1, m.y1, 70, 0xffffff, 0.5); } } },
  heal: { cast(k, m) { const x = Number.isFinite(m.x1) ? m.x1 : m.x0, y = Number.isFinite(m.y1) ? m.y1 : m.y0; k.steam(m.x0, m.y0, 60, 0xd9ffc9, 8); k.shape(4, m.x0, m.y0, 70, 0x7ed957, { dur: 0.7, z: 0.3 }); if (x !== m.x0 || y !== m.y0) k.shape(4, x, y, 70, 0x7ed957, { dur: 0.7, z: 0.3 }); } },
  ghost: { cast(k, m) { for (let i = 0; i < 4; i++) k.chev(m.x0 + (i - 1.5) * 40, m.y0, 0, 0x39c2ff, 2, 60, 45, 0.5); k.ring(m.x0, m.y0, 90, 0x39c2ff, 0.5); } }, // Overtime
  barrier: { cast(k, m) { k.hex(m.x0, m.y0, 110, 0xb084ff, 0.9); k.hex(m.x0, m.y0, 75, 0xffffff, 0.9, 0.1); k.chev(m.x0, m.y0, 3.1416, 0xb084ff, 2, 50, 45, 0.5); } }, // Undo
  ignite: { cast(k, m) { const x = Number.isFinite(m.x1) ? m.x1 : m.x0, y = Number.isFinite(m.y1) ? m.y1 : m.y0; k.steam(x, y, 50, 0xff7a1a, 10, 2.4); k.shape(6, x, y - 20, 50, 0xffd23f, { rot: -1.5708, dur: 0.7, z: 0.9 }); k.ring(x, y, 70, 0xff7a1a, 0.6); } }, // Escalate
  smite: { cast(k, m) { const x = Number.isFinite(m.x1) ? m.x1 : m.x0, y = Number.isFinite(m.y1) ? m.y1 : m.y0; k.cross(x, y, 80, 0xff3b8a, 0.7); k.shape(3, x, y, 70, 0xff3b8a, { rot: 0.785, sz: 8, dur: 0.5, z: 0.5 }); k.shape(3, x, y, 70, 0xff3b8a, { rot: -0.785, sz: 8, dur: 0.5, z: 0.5 }); } }, // kill -9
};
