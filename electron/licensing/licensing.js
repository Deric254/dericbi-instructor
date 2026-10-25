'use strict';
/**
 * Offline licensing for a locally installed Node / Electron app. Node's built-in crypto only, no dependencies.
 * Same licence format as the Python module (licensing.py): a licence made by either one is accepted by the other.
 *
 *   const { Licensing, FileStore } = require('./licensing');
 *   const lic = new Licensing({ appId: 'Acme CRM', prefix: 'ACM', publicKeyHex: OWNER_PUBLIC_KEY,
 *                               store: new FileStore(app.getPath('userData')) });
 *   const st = lic.state();           // { ok, kind: 'owner'|'licensed'|'unlicensed'|'unconfigured', message, ... }
 *   if (!st.ok) showActivationScreen(lic.installId(), st.message);
 *
 * Verification happens in every copy of the app. Issuing (issue) is only reachable from the Owner Console, which
 * needs the owner key that never leaves the owner's computer (see electron/services/owner.service.ts).
 */
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const SPKI_PREFIX = Buffer.from('302a300506032b6570032100', 'hex');
const PKCS8_PREFIX = Buffer.from('302e020100300506032b657004220420', 'hex');
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

class LicenceError extends Error {}

const b64 = (buf) => Buffer.from(buf).toString('base64url');
const unb64 = (s) => Buffer.from(s, 'base64url');
const normCode = (c) => String(c || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const isoDate = (d) => d.toISOString().slice(0, 10);
const publicObject = (raw) => crypto.createPublicKey({ key: Buffer.concat([SPKI_PREFIX, raw]), format: 'der', type: 'spki' });
const privateObject = (seed) => crypto.createPrivateKey({ key: Buffer.concat([PKCS8_PREFIX, seed]), format: 'der', type: 'pkcs8' });
const publicFromSeed = (seed) => crypto.createPublicKey(privateObject(seed)).export({ format: 'der', type: 'spki' }).subarray(-32);

class FileStore {
  constructor(dir, filename = 'licensing.json') {
    fs.mkdirSync(dir, { recursive: true });
    this.file = path.join(dir, filename);
  }
  _load() {
    try { const d = JSON.parse(fs.readFileSync(this.file, 'utf8')); return d && typeof d === 'object' ? d : {}; } catch { return {}; }
  }
  get(key, dflt = null) { const d = this._load(); return key in d ? d[key] : dflt; }
  set(key, value) {
    const d = this._load(); d[key] = value;
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(d)); fs.renameSync(tmp, this.file);
  }
}

class Licensing {
  constructor({ appId, prefix, publicKeyHex, store, version = 1, maxDays = 365, graceDays = 0, rollbackSeconds = 86400,
                today = () => new Date(), clock = () => Math.floor(Date.now() / 1000) }) {
    if (!/^[A-Z]{2,6}$/.test(prefix || '')) throw new Error('prefix must be 2 to 6 capital letters');
    Object.assign(this, { appId, prefix, version, store, maxDays, graceDays, rollbackSeconds, _today: today, _clock: clock });
    const raw = /^[0-9a-fA-F]{64}$/.test((publicKeyHex || '').trim()) ? Buffer.from(publicKeyHex.trim(), 'hex') : null;
    this.publicRaw = raw;
    this.publicKey = raw ? publicObject(raw) : null;
  }
  get tag() { return `${this.prefix}${this.version}`; }
  configured() { return this.publicKey !== null; }

  static makeOwnerKey(prefix) {
    const seed = crypto.randomBytes(32);
    return { keyText: `${prefix}-OWNER-${b64(seed)}`, publicHex: publicFromSeed(seed).toString('hex') };
  }
  parseOwnerKey(text) {
    const m = new RegExp(`^${this.prefix}-OWNER-([A-Za-z0-9_-]{43})$`).exec(String(text || '').replace(/\s+/g, ''));
    if (!m) throw new LicenceError(`That isn't an owner key. It starts with ${this.prefix}-OWNER- and is in the owner key file.`);
    return unb64(m[1]);
  }
  ownerKeyMatches(seed) { return !!this.publicRaw && crypto.timingSafeEqual(publicFromSeed(seed), this.publicRaw); }

  issue(seed, code, user, days, features) {
    if (!this.ownerKeyMatches(seed)) throw new LicenceError("That owner key doesn't belong to this app. Use the key made for this app's installer.");
    const norm = normCode(code);
    if (norm.length !== 12) throw new Error('The activation code is 12 letters and numbers, like ABCD-EFGH-JKLM.');
    user = String(user || '').trim().replace(/\s+/g, ' ');
    if (user.length < 1 || user.length > 60) throw new Error("Give the licence holder's name (1 to 60 characters).");
    days = Math.trunc(Number(days));
    if (!(days >= 1 && days <= this.maxDays)) throw new Error(`A licence lasts 1 to ${this.maxDays} days.`);
    const today = this._today();
    const expires = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate() + days));
    const body = { app: this.appId, expires: isoDate(expires), for: norm, issued: isoDate(today), role: 'member', user, v: this.version };
    if (features && features.length) body.features = [...new Set(features.map(String))].sort();
    // keys in sorted order, no spaces: identical bytes to the Python module (verification does not depend on it)
    const payload = Buffer.from(JSON.stringify(Object.fromEntries(Object.entries(body).sort(([a], [b]) => (a < b ? -1 : 1)))));
    const sig = crypto.sign(null, payload, privateObject(seed));
    return { licence: `${this.tag}.${b64(payload)}.${b64(sig)}`, expires: body.expires, user, for: norm };
  }

  installId() {
    let code = this.store.get('install_id');
    if (!(typeof code === 'string' && normCode(code).length === 12)) {
      let raw = ''; for (let i = 0; i < 12; i++) raw += ALPHABET[crypto.randomInt(ALPHABET.length)];
      code = `${raw.slice(0, 4)}-${raw.slice(4, 8)}-${raw.slice(8)}`;
      this.store.set('install_id', code);
    }
    return code;
  }

  read(token, forInstall) {
    if (!this.configured()) throw new LicenceError("This copy of the app can't check licences yet (the owner key isn't set in the build).");
    const bad = new LicenceError("That doesn't look like a licence. Paste the whole text the owner sent you.");
    const parts = String(token || '').replace(/\s+/g, '').split('.');
    if (parts.length !== 3 || parts[0] !== this.tag) throw bad;
    let payload, sig, data;
    try { payload = unb64(parts[1]); sig = unb64(parts[2]); data = JSON.parse(payload.toString('utf8')); } catch { throw bad; }
    if (!data || typeof data !== 'object' || Array.isArray(data)) throw bad;
    let valid = false;
    try { valid = sig.length === 64 && crypto.verify(null, payload, this.publicKey, sig); } catch { valid = false; }
    if (!valid) throw new LicenceError("This licence wasn't signed by the owner, so it can't be used.");
    if (data.app !== this.appId) throw new LicenceError('This licence is for a different app.');
    if (data.for !== normCode(forInstall || this.installId())) throw new LicenceError('This licence was made for a different computer. Send the owner the activation code shown on this screen.');
    const exp = /^\d{4}-\d{2}-\d{2}$/.test(data.expires || '') ? new Date(`${data.expires}T00:00:00Z`) : null;
    if (!exp || isNaN(exp)) throw new LicenceError('That licence has no valid expiry date.');
    const t = this._today();
    const todayUtc = Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate());
    if (exp.getTime() + this.graceDays * 86400000 < todayUtc) throw new LicenceError('This licence has expired. Ask the owner for a new one.');
    return data;
  }

  activate(token, expectUser) {
    const data = this.read(token);
    if (expectUser && String(data.user || '').toLowerCase() !== String(expectUser).trim().toLowerCase())
      throw new LicenceError('This licence is for a different person than the one who uses this computer.');
    this.store.set('license', String(token).replace(/\s+/g, ''));
    return data;
  }

  _ownerMsg() { return Buffer.from(`owner:${this.appId}:${normCode(this.installId())}`); }
  claimOwner(keyText) {
    const seed = this.parseOwnerKey(keyText);
    if (!this.ownerKeyMatches(seed)) throw new LicenceError("That owner key doesn't belong to this app, so it can't claim the owner copy.");
    this.store.set('owner_proof', b64(crypto.sign(null, this._ownerMsg(), privateObject(seed))));
  }
  _ownerOk() {
    const proof = this.store.get('owner_proof');
    if (!this.publicKey || typeof proof !== 'string') return false;
    try { return crypto.verify(null, this._ownerMsg(), this.publicKey, unb64(proof)); } catch { return false; }
  }

  clockOk() {
    const high = this.store.get('clock_high', 0) || 0;
    const t = Math.floor(this._clock());
    if (t < high - this.rollbackSeconds) return false;
    if (t > high + 60) this.store.set('clock_high', t);
    return true;
  }

  state() {
    if (!this.configured()) return { ok: false, kind: 'unconfigured', message: "This build has no owner key, so it can't be used. Set the owner public key and rebuild." };
    if (this._ownerOk()) return { ok: true, kind: 'owner', message: '' };
    const token = this.store.get('license');
    const unlicensed = (message) => ({ ok: false, kind: 'unlicensed', message, install_id: this.installId() });
    if (!token) return unlicensed("This computer isn't licensed yet.");
    let data;
    try { data = this.read(token); } catch (e) { if (e instanceof LicenceError) return unlicensed(e.message); throw e; }
    if (!this.clockOk()) return unlicensed("This computer's clock was set back. Fix the date and time to continue.");
    const t = this._today();
    const left = Math.round((new Date(`${data.expires}T00:00:00Z`).getTime() - Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), t.getUTCDate())) / 86400000);
    return { ok: true, kind: 'licensed', message: '', expires: data.expires, days_left: left, user: data.user, features: data.features || [] };
  }
}

module.exports = { Licensing, FileStore, LicenceError, normCode };
