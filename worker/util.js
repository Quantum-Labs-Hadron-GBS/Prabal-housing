// Small helpers shared by the API routes.

export class HttpError extends Error {
    constructor(status, message) {
        super(message);
        this.status = status;
    }
}

export function json(data, status = 200, headers = {}) {
    return new Response(JSON.stringify(data), {
        status,
        headers: {
            'Content-Type': 'application/json; charset=UTF-8',
            'Cache-Control': 'no-store',
            ...headers
        }
    });
}

export async function readJSON(request, maxBytes = 64 * 1024) {
    const type = request.headers.get('Content-Type') || '';
    if (!type.includes('application/json')) throw new HttpError(415, 'Expected JSON.');
    const text = await request.text();
    if (text.length > maxBytes) throw new HttpError(413, 'Request is too large.');
    try {
        return text ? JSON.parse(text) : {};
    } catch {
        throw new HttpError(400, 'Invalid JSON.');
    }
}

export function clientIP(request) {
    return request.headers.get('CF-Connecting-IP') || request.headers.get('X-Forwarded-For') || 'unknown';
}

export function randomId(prefix = '') {
    const bytes = crypto.getRandomValues(new Uint8Array(9));
    const id = [...bytes].map(b => b.toString(36).padStart(2, '0')).join('').slice(0, 14);
    return prefix ? `${prefix}-${id}` : id;
}

export function toHex(buffer) {
    return [...new Uint8Array(buffer)].map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function sha256(text) {
    return toHex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
}

export function escapeHTML(value) {
    return String(value ?? '').replace(/[&<>"']/g, ch => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
    }[ch]));
}

// Trim, collapse control characters and cap length of free-text input.
export function clean(value, max = 500) {
    return String(value ?? '')
        .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, '')
        .trim()
        .slice(0, max);
}

export const isEmail = s => /^[^\s@<>()"',;]+@[^\s@<>()"',;]+\.[a-z]{2,}$/i.test(s);

// Simple sliding-window limiter backed by D1. Returns true when over the limit.
export async function rateLimited(env, bucket, key, limit, windowSeconds) {
    const now = Date.now();
    const since = now - windowSeconds * 1000;
    const row = await env.DB.prepare('SELECT COUNT(*) AS n FROM rate_events WHERE bucket = ? AND key = ? AND at > ?')
        .bind(bucket, key, since).first();
    if ((row?.n || 0) >= limit) return true;
    await env.DB.prepare('INSERT INTO rate_events (bucket, key, at) VALUES (?, ?, ?)').bind(bucket, key, now).run();
    return false;
}

export async function clearRate(env, bucket, key) {
    await env.DB.prepare('DELETE FROM rate_events WHERE bucket = ? AND key = ?').bind(bucket, key).run();
}
