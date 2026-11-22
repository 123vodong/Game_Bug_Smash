// server/game/identity.js — Pass 2 RP-01. The browser keeps a random secret `pid`
// (32 hex chars, localStorage); the server never stores or shows it — only this public id.
import crypto from 'crypto';

const PID_RE = /^[0-9a-f]{32}$/;

/** Secret pid → 16-hex public id ('' for anything that isn't a well-formed pid). */
export function publicIdOf(pid) {
  if (typeof pid !== 'string' || !PID_RE.test(pid)) return '';
  return crypto.createHash('sha256').update(`bug-smash:${pid}`).digest('hex').slice(0, 16);
}
