/**
 * PRABAL HOUSING — Cloudflare Worker
 *
 * Static pages are served by Workers Assets. Only /api/* reaches this code:
 *
 *   Public
 *     GET    /api/properties                 live listings (used by /properties and the homepage)
 *     GET    /api/media/listings/<file>      listing photos stored in Workers KV
 *     POST   /api/forms/contact|career|shortlist   website forms → D1 + email
 *
 *   Dashboard (signed-in admins)
 *     GET    /api/auth/status    POST /api/auth/login|logout|setup|password
 *     POST   /api/admin/properties           create / update a listing
 *     PATCH  /api/admin/properties/<id>      { status }
 *     DELETE /api/admin/properties/<id>
 *     POST   /api/admin/upload               listing photo (image/webp|jpeg|png body)
 *     DELETE /api/admin/media/listings/<file>
 *     GET    /api/admin/enquiries            form submissions
 *     GET    /api/admin/enquiries/<id>/file  download résumé
 *     DELETE /api/admin/enquiries/<id>
 *     GET|POST /api/admin/team   DELETE /api/admin/team/<id>
 */

import { HttpError, json, readJSON, randomId } from './util.js';
import * as db from './db.js';
import * as auth from './auth.js';
import { handleForm, listEnquiries, enquiryFile, deleteEnquiry } from './forms.js';

const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const PHOTO_TYPES = { 'image/webp': 'webp', 'image/jpeg': 'jpg', 'image/png': 'png' };

export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        try {
            if (!url.pathname.startsWith('/api/')) {
                const response = await env.ASSETS.fetch(request);
                const contentType = response.headers.get('content-type') || '';
                if (contentType.includes('text/html') && !contentType.includes('charset')) {
                    const headers = new Headers(response.headers);
                    headers.set('content-type', 'text/html; charset=utf-8');
                    return new Response(response.body, {
                        status: response.status,
                        statusText: response.statusText,
                        headers
                    });
                }
                return response;
            }
            if (!env.DB || !env.FILES) throw new HttpError(503, 'The database or file storage is not connected. See BACKEND.md.');

            // Block cross-site writes (defence in depth on top of SameSite cookies)
            if (!['GET', 'HEAD'].includes(request.method)) {
                const origin = request.headers.get('Origin');
                if (origin && new URL(origin).host !== url.host) throw new HttpError(403, 'Cross-site request blocked.');
            }

            await db.ensureSchema(env);
            if (Math.random() < 0.02) ctx.waitUntil(housekeeping(env));
            return await route(request, env, ctx, url);
        } catch (err) {
            if (err instanceof HttpError) return json({ error: err.message }, err.status);
            console.error(err);
            return json({ error: 'Something went wrong on our side. Please try again.' }, 500);
        }
    }
};

async function route(request, env, ctx, url) {
    const { pathname: path } = url;
    const method = request.method;
    let m;

    // ---- public --------------------------------------------------------------------
    if (path === '/api/properties' && method === 'GET') {
        return json(await db.listProperties(env), 200, { 'Cache-Control': 'no-cache' });
    }

    if ((m = path.match(/^\/api\/media\/(listings\/[a-zA-Z0-9_.\-]+)$/)) && method === 'GET') {
        return serveMedia(request, env, ctx, m[1]);
    }

    if ((m = path.match(/^\/api\/forms\/([a-z]+)$/)) && method === 'POST') {
        return handleForm(request, env, ctx, m[1]);
    }

    // ---- auth ------------------------------------------------------------------------
    if (path === '/api/auth/status' && method === 'GET') return json(await auth.status(request, env));

    if (path === '/api/auth/login' && method === 'POST') {
        const { cookie, user } = await auth.login(request, env, await readJSON(request));
        return json({ user }, 200, { 'Set-Cookie': cookie });
    }
    if (path === '/api/auth/setup' && method === 'POST') {
        const { cookie, user } = await auth.setup(request, env, await readJSON(request));
        return json({ user }, 200, { 'Set-Cookie': cookie });
    }
    if (path === '/api/auth/logout' && method === 'POST') {
        return json({ ok: true }, 200, { 'Set-Cookie': await auth.logout(request, env) });
    }

    // ---- everything below needs a signed-in admin -------------------------------------
    if (!path.startsWith('/api/admin/') && path !== '/api/auth/password') throw new HttpError(404, 'Not found.');
    const admin = await auth.requireAdmin(request, env);

    if (path === '/api/auth/password' && method === 'POST') {
        await auth.changePassword(env, admin, await readJSON(request));
        return json({ ok: true });
    }

    if (path === '/api/admin/properties' && method === 'POST') {
        const input = await readJSON(request);
        const problem = db.validateProperty(db.normaliseProperty(input));
        if (problem) throw new HttpError(400, problem);
        return json(await db.saveProperty(env, input));
    }
    if ((m = path.match(/^\/api\/admin\/properties\/([\w\-]+)$/))) {
        const id = m[1];
        if (method === 'PATCH') {
            const { status } = await readJSON(request);
            const p = await db.setPropertyStatus(env, id, status);
            if (!p) throw new HttpError(404, 'That listing no longer exists.');
            return json(p);
        }
        if (method === 'DELETE') {
            const removed = await db.deleteProperty(env, id);
            if (removed?.image_path) ctx.waitUntil(env.FILES.delete(removed.image_path));
            return json({ ok: true });
        }
    }

    if (path === '/api/admin/upload' && method === 'POST') {
        const type = (request.headers.get('Content-Type') || '').split(';')[0].trim();
        const ext = PHOTO_TYPES[type];
        if (!ext) throw new HttpError(415, 'Please upload a JPG, PNG or WebP image.');
        const body = await request.arrayBuffer();
        if (!body.byteLength) throw new HttpError(400, 'The photo is empty.');
        if (body.byteLength > MAX_PHOTO_BYTES) throw new HttpError(413, 'That photo is too large (max 5 MB).');
        const key = `listings/${Date.now()}-${randomId()}.${ext}`;
        await env.FILES.put(key, body, { metadata: { contentType: type } });
        return json({ url: `/api/media/${key}`, path: key });
    }

    if ((m = path.match(/^\/api\/admin\/media\/(listings\/[a-zA-Z0-9_.\-]+)$/)) && method === 'DELETE') {
        // Only delete photos that no listing still uses
        const inUse = await env.DB.prepare('SELECT id FROM properties WHERE image_path = ?').bind(m[1]).first();
        if (!inUse) await env.FILES.delete(m[1]);
        return json({ ok: true });
    }

    if (path === '/api/admin/enquiries' && method === 'GET') return json(await listEnquiries(env, url));
    if ((m = path.match(/^\/api\/admin\/enquiries\/([\w\-]+)\/file$/)) && method === 'GET') return enquiryFile(env, m[1]);
    if ((m = path.match(/^\/api\/admin\/enquiries\/([\w\-]+)$/)) && method === 'DELETE') {
        await deleteEnquiry(env, m[1]);
        return json({ ok: true });
    }

    if (path === '/api/admin/team') {
        if (method === 'GET') return json({ me: admin.email, team: await auth.listTeam(env) });
        if (method === 'POST') {
            await auth.addTeamMember(env, admin, await readJSON(request));
            return json({ ok: true });
        }
    }
    if ((m = path.match(/^\/api\/admin\/team\/(\d+)$/)) && method === 'DELETE') {
        await auth.removeTeamMember(env, admin, m[1]);
        return json({ ok: true });
    }

    throw new HttpError(404, 'Not found.');
}

async function serveMedia(request, env, ctx, key) {
    const cache = caches.default;
    const cached = await cache.match(request);
    if (cached) return cached;

    const { value, metadata } = await env.FILES.getWithMetadata(key, { type: 'stream', cacheTtl: 86400 });
    if (!value) return new Response('Not found', { status: 404 });
    const res = new Response(value, {
        headers: {
            'Content-Type': metadata?.contentType || 'image/webp',
            'Cache-Control': 'public, max-age=31536000, immutable',
            'X-Content-Type-Options': 'nosniff'
        }
    });
    ctx.waitUntil(cache.put(request, res.clone()));
    return res;
}

async function housekeeping(env) {
    await env.DB.batch([
        env.DB.prepare('DELETE FROM rate_events WHERE at < ?').bind(Date.now() - 864e5),
        env.DB.prepare('DELETE FROM sessions WHERE expires_at < ?').bind(Date.now())
    ]);
}
