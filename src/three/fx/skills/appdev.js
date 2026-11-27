// AppDev (Swipe): notification-badge rings, swipe chevrons, store-launch star, pink.
const P = 0xff4fa3;
export default {
  q: { land(k, m, x, y) { k.pings(x, y, 80, P, 2); k.shape(4, x, y, 40, 0xffffff, { dur: 0.5, z: 0.3 }); } }, // Push Notification
  w: { land(k, m, x, y) { k.pings(x, y, 70, P, 2); k.shards(x, y, 0xffffff, 5, 60); } }, // Burst Update
  e: { cast(k, m) { const p = k.me(m); k.spiral(p.x, p.y, 120, P, 12, false); k.chev(p.x, p.y, 3.1416, P, 3, 50, 45, 0.4); } }, // Swipe Left
  r: { land(k, m, x, y) { k.flash(x, y, 150, 0xffffff, 0.5); k.rays(x, y, 190, P, 0.6); k.hex(x, y, 120, P, 0.8); } }, // App Store Launch
};
