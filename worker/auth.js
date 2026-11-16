// Admin accounts and sessions.
//
// - Passwords: PBKDF2-SHA256 (100k iterations, the Workers maximum) with a random salt.
// - Sessions: a random token in an HttpOnly, Secure, SameSite=Strict cookie; only
//   its SHA-256 hash is stored in D1, so a database leak can't be replayed.
// - The very first admin is created from the dashboard with the SETUP_KEY secret.

import { HttpError, clientIP, clearRate, isEmail, rateLimited, sha256, toHex } from './util.js';

const COOKIE = '__Host-ph_session';
const SESSION_DAYS = 14;
const ITERATIONS = 100000;
export const MIN_PASSWORD = 10;

// ---- passwords ----------------------------------------------------------------

async function pbkdf2(password, salt, iterations) {
    const key = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveBits']);
    const bits = await crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt, iterations }, key, 256);
    return toHex(bits);
}

function fromHex(hex) {
    return new Uint8Array(hex.match(/../g).map(h => parseInt(h, 16)));
}

export async function hashPassword(password) {
    const salt = crypto.getRandomValues(new Uint8Array(16));
    return `pbkdf2$${ITERATIONS}$${toHex(salt)}$${await pbkdf2(password, salt, ITERATIONS)}`;
}

async function verifyPassword(password, stored) {
    const [scheme, iter, salt, hash] = String(stored).split('$');
    if (scheme !== 'pbkdf2' || !salt || !hash) return false;
    const candidate = await pbkdf2(password, fromHex(salt), Number(iter));
    return timingSafeEqual(candidate, hash);
}

function timingSafeEqual(a, b) {
    if (a.length !== b.length) return false;
    let diff = 0;
    for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return diff === 0;
}

export function checkPasswordStrength(password) {
    if (typeof password !== 'string' || password.length < MIN_PASSWORD) {
        return `Use a password of at least ${MIN_PASSWORD} characters.`;
    }
    if (password.length > 200) return 'That password is too long.';
    return '';
}

// ---- sessions -------------------------------------------------------------------

function readCookie(request, name) {
    const header = request.headers.get('Cookie') || '';
    for (const part of header.split(';')) {
        const [k, ...v] = part.trim().split('=');
        if (k === name) return v.join('=');
    }
    return '';
}

function sessionCookie(token, maxAge) {
    return `${COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`;
}

async function createSession(env, adminId) {
    const token = toHex(crypto.getRandomValues(new Uint8Array(32)));
    const expires = Date.now() + SESSION_DAYS * 864e5;
    await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now()),
        env.DB.prepare('INSERT INTO sessions (token_hash, admin_id, expires_at, created_at) VALUES (?, ?, ?, ?)')
            .bind(await sha256(token), adminId, expires, new Date().toISOString())
    ]);
    return sessionCookie(token, SESSION_DAYS * 86400);
}

// Returns { id, email } for a signed-in admin, or null.
export async function currentAdmin(request, env) {
    const token = readCookie(request, COOKIE);
    if (!/^[a-f0-9]{64}$/.test(token)) return null;
    const row = await env.DB.prepare(`SELECT a.id, a.email FROM sessions s JOIN admins a ON a.id = s.admin_id
        WHERE s.token_hash = ? AND s.expires_at > ?`).bind(await sha256(token), Date.now()).first();
    return row || null;
}

export async function requireAdmin(request, env) {
    const admin = await currentAdmin(request, env);
    if (!admin) throw new HttpError(401, 'Your session has ended. Please sign in again.');
    return admin;
}

async function adminCount(env) {
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM admins').first();
    return row?.n || 0;
}

// ---- route handlers ---------------------------------------------------------------

export async function status(request, env) {
    const admin = await currentAdmin(request, env);
    return { user: admin ? { email: admin.email } : null, needsSetup: (await adminCount(env)) === 0 };
}

export async function login(request, env, body) {
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    if (!email || !password) throw new HttpError(400, 'Enter your email and password.');

    // 8 failed tries per IP or per account every 15 minutes
    const ip = clientIP(request);
    if (await rateLimited(env, 'login-ip', ip, 8, 900) || await rateLimited(env, 'login-email', email, 8, 900)) {
        throw new HttpError(429, 'Too many sign-in attempts. Please wait 15 minutes and try again.');
    }

    const admin = await env.DB.prepare('SELECT id, email, password_hash FROM admins WHERE email = ?').bind(email).first();
    // Hash even when the account doesn't exist so response time doesn't reveal valid emails
    const ok = admin
        ? await verifyPassword(password, admin.password_hash)
        : (await hashPassword(password), false);
    if (!ok) throw new HttpError(401, 'Wrong email or password.');

    await clearRate(env, 'login-email', email);
    await clearRate(env, 'login-ip', ip);
    return { cookie: await createSession(env, admin.id), user: { email: admin.email } };
}

export async function logout(request, env) {
    const token = readCookie(request, COOKIE);
    if (token) await env.DB.prepare('DELETE FROM sessions WHERE token_hash = ?').bind(await sha256(token)).run();
    return sessionCookie('', 0);
}

// One-time: create the first admin. Requires the SETUP_KEY secret and an empty admins table.
export async function setup(request, env, body) {
    if (!env.SETUP_KEY) throw new HttpError(503, 'SETUP_KEY is not set on the server yet. See BACKEND.md, step 3.');
    if (await rateLimited(env, 'setup', clientIP(request), 5, 900)) {
        throw new HttpError(429, 'Too many attempts. Please wait 15 minutes.');
    }
    if ((await adminCount(env)) > 0) throw new HttpError(409, 'An admin already exists. Please sign in.');
    if (!timingSafeEqual(await sha256(String(body.setupKey || '')), await sha256(env.SETUP_KEY))) {
        throw new HttpError(403, 'That setup key is not correct.');
    }

    const email = String(body.email || '').trim().toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
    const weak = checkPasswordStrength(body.password);
    if (weak) throw new HttpError(400, weak);

    const res = await env.DB.prepare('INSERT INTO admins (email, password_hash, created_at, created_by) VALUES (?, ?, ?, ?)')
        .bind(email, await hashPassword(body.password), new Date().toISOString(), 'setup').run();
    return { cookie: await createSession(env, res.meta.last_row_id), user: { email } };
}

export async function changePassword(env, admin, body) {
    const row = await env.DB.prepare('SELECT password_hash FROM admins WHERE id = ?').bind(admin.id).first();
    if (!row || !(await verifyPassword(String(body.current || ''), row.password_hash))) {
        throw new HttpError(400, 'Your current password is not correct.');
    }
    const weak = checkPasswordStrength(body.next);
    if (weak) throw new HttpError(400, weak);
    await env.DB.prepare('UPDATE admins SET password_hash = ? WHERE id = ?').bind(await hashPassword(body.next), admin.id).run();
}

// ---- team ------------------------------------------------------------------------

export async function listTeam(env) {
    const { results } = await env.DB.prepare('SELECT id, email, created_at, created_by FROM admins ORDER BY created_at').all();
    return results;
}

export async function addTeamMember(env, admin, body) {
    const email = String(body.email || '').trim().toLowerCase();
    if (!isEmail(email)) throw new HttpError(400, 'Enter a valid email address.');
    const weak = checkPasswordStrength(body.password);
    if (weak) throw new HttpError(400, weak);
    const exists = await env.DB.prepare('SELECT id FROM admins WHERE email = ?').bind(email).first();
    if (exists) throw new HttpError(409, 'That person already has access.');
    await env.DB.prepare('INSERT INTO admins (email, password_hash, created_at, created_by) VALUES (?, ?, ?, ?)')
        .bind(email, await hashPassword(body.password), new Date().toISOString(), admin.email).run();
}

export async function removeTeamMember(env, admin, id) {
    if (Number(id) === admin.id) throw new HttpError(400, "You can't remove your own access.");
    await env.DB.batch([
        env.DB.prepare('DELETE FROM sessions WHERE admin_id = ?').bind(id),
        env.DB.prepare('DELETE FROM admins WHERE id = ?').bind(id)
    ]);
}
