// D1 schema, first-run seeding, and property records.
//
// The schema is created automatically the first time the Worker runs, so a
// fresh deploy needs no manual migration step. Bump SCHEMA_VERSION and add
// statements to MIGRATIONS when the schema changes.

import { clean, randomId } from './util.js';

const SCHEMA_VERSION = 1;

const MIGRATIONS = {
    1: [
        `CREATE TABLE IF NOT EXISTS meta (key TEXT PRIMARY KEY, value TEXT)`,
        `CREATE TABLE IF NOT EXISTS properties (
            id TEXT PRIMARY KEY,
            title TEXT NOT NULL,
            developer TEXT NOT NULL DEFAULT '',
            configurations TEXT NOT NULL DEFAULT '[]',
            price_lakhs REAL,
            price_onwards INTEGER NOT NULL DEFAULT 0,
            price_label TEXT NOT NULL DEFAULT '',
            carpet_area TEXT NOT NULL DEFAULT '',
            location TEXT NOT NULL,
            city TEXT NOT NULL DEFAULT 'Pune',
            image_url TEXT NOT NULL DEFAULT '',
            image_path TEXT NOT NULL DEFAULT '',
            status TEXT NOT NULL DEFAULT 'available',
            featured INTEGER NOT NULL DEFAULT 0,
            rera TEXT NOT NULL DEFAULT '',
            sort_order INTEGER NOT NULL DEFAULT 0,
            created_at TEXT NOT NULL,
            updated_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS admins (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            email TEXT NOT NULL UNIQUE COLLATE NOCASE,
            password_hash TEXT NOT NULL,
            created_at TEXT NOT NULL,
            created_by TEXT NOT NULL DEFAULT ''
        )`,
        `CREATE TABLE IF NOT EXISTS sessions (
            token_hash TEXT PRIMARY KEY,
            admin_id INTEGER NOT NULL REFERENCES admins(id) ON DELETE CASCADE,
            expires_at INTEGER NOT NULL,
            created_at TEXT NOT NULL
        )`,
        `CREATE TABLE IF NOT EXISTS enquiries (
            id TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            name TEXT NOT NULL DEFAULT '',
            email TEXT NOT NULL DEFAULT '',
            phone TEXT NOT NULL DEFAULT '',
            data TEXT NOT NULL DEFAULT '{}',
            file_key TEXT NOT NULL DEFAULT '',
            file_name TEXT NOT NULL DEFAULT '',
            email_status TEXT NOT NULL DEFAULT 'pending',
            email_error TEXT NOT NULL DEFAULT '',
            created_at TEXT NOT NULL
        )`,
        `CREATE INDEX IF NOT EXISTS enquiries_created ON enquiries (created_at DESC)`,
        `CREATE TABLE IF NOT EXISTS rate_events (bucket TEXT NOT NULL, key TEXT NOT NULL, at INTEGER NOT NULL)`,
        `CREATE INDEX IF NOT EXISTS rate_events_lookup ON rate_events (bucket, key, at)`
    ]
};

let ready = null;

// Runs once per Worker instance; cheap after the first request.
export function ensureSchema(env) {
    if (!ready) {
        ready = migrate(env).catch(err => {
            ready = null; // retry on the next request
            throw err;
        });
    }
    return ready;
}

async function migrate(env) {
    let current = 0;
    try {
        const row = await env.DB.prepare("SELECT value FROM meta WHERE key = 'schema_version'").first();
        current = Number(row?.value) || 0;
    } catch {
        current = 0; // meta table doesn't exist yet
    }
    if (current >= SCHEMA_VERSION) return;

    for (let v = current + 1; v <= SCHEMA_VERSION; v++) {
        await env.DB.batch([
            ...MIGRATIONS[v].map(sql => env.DB.prepare(sql)),
            env.DB.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('schema_version', ?)").bind(String(v))
        ]);
    }
    await seedProperties(env);
}

// First deploy only: copy the listings from data/properties.json into D1 so the
// site keeps showing them. Never runs again, even if every listing is deleted.
async function seedProperties(env) {
    const seeded = await env.DB.prepare("SELECT value FROM meta WHERE key = 'seeded'").first();
    if (seeded) return;

    let list = [];
    try {
        const res = await env.ASSETS.fetch(new Request('https://assets.local/data/properties.json'));
        if (res.ok) list = await res.json();
    } catch {
        list = [];
    }

    const now = new Date().toISOString();
    const statements = (Array.isArray(list) ? list : []).map((raw, i) => {
        const p = normaliseProperty({ ...raw, id: raw.id || randomId('prop') });
        return insertStatement(env, { ...p, sort_order: p.sort_order || i + 1, created_at: raw.created_at || now, updated_at: now });
    });
    statements.push(env.DB.prepare("INSERT OR REPLACE INTO meta (key, value) VALUES ('seeded', ?)").bind(now));
    await env.DB.batch(statements);
}

// ---- properties -------------------------------------------------------------

export const STATUSES = ['available', 'new_launch', 'closed'];

// Only allow images we host (uploaded via the dashboard, or shipped in /images) or https URLs.
function safeImage(url) {
    const s = clean(url, 1000);
    if (/^https:\/\//i.test(s)) return s;
    if (/^\/?api\/media\/[a-zA-Z0-9_.\-\/]+$/.test(s)) return s.startsWith('/') ? s : `/${s}`;
    if (/^\/?images\/[a-zA-Z0-9_.\-\/]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(s)) return s;
    return '';
}

export function normaliseProperty(p) {
    const lakhs = p.price_lakhs === '' || p.price_lakhs == null ? null : Number(p.price_lakhs);
    const configs = Array.isArray(p.configurations) ? p.configurations : [];
    return {
        id: clean(p.id, 64),
        title: clean(p.title, 120),
        developer: clean(p.developer, 120),
        configurations: configs.map(c => clean(c, 30)).filter(Boolean).slice(0, 20),
        price_lakhs: Number.isFinite(lakhs) && lakhs > 0 ? Math.round(lakhs * 100) / 100 : null,
        price_onwards: Boolean(p.price_onwards),
        price_label: clean(p.price_label, 300),
        carpet_area: clean(p.carpet_area, 300),
        location: clean(p.location, 160),
        city: clean(p.city, 60) || 'Pune',
        image_url: safeImage(p.image_url),
        image_path: /^listings\/[a-zA-Z0-9_.\-]+$/.test(p.image_path || '') ? p.image_path : '',
        status: STATUSES.includes(p.status) ? p.status : 'available',
        featured: Boolean(p.featured),
        rera: clean(p.rera, 60),
        sort_order: Number.parseInt(p.sort_order, 10) || 0
    };
}

function rowToProperty(r) {
    let configurations = [];
    try { configurations = JSON.parse(r.configurations); } catch { /* keep empty */ }
    return {
        ...r,
        configurations,
        price_onwards: Boolean(r.price_onwards),
        featured: Boolean(r.featured)
    };
}

function insertStatement(env, p) {
    return env.DB.prepare(`INSERT INTO properties
        (id, title, developer, configurations, price_lakhs, price_onwards, price_label, carpet_area,
         location, city, image_url, image_path, status, featured, rera, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(p.id, p.title, p.developer, JSON.stringify(p.configurations), p.price_lakhs, p.price_onwards ? 1 : 0,
            p.price_label, p.carpet_area, p.location, p.city, p.image_url, p.image_path, p.status,
            p.featured ? 1 : 0, p.rera, p.sort_order, p.created_at, p.updated_at);
}

export async function listProperties(env) {
    const { results } = await env.DB.prepare('SELECT * FROM properties ORDER BY created_at DESC').all();
    return results.map(rowToProperty);
}

export async function getProperty(env, id) {
    const row = await env.DB.prepare('SELECT * FROM properties WHERE id = ?').bind(id).first();
    return row ? rowToProperty(row) : null;
}

export function validateProperty(p) {
    if (!p.title) return 'Please add the project name.';
    if (!p.location) return 'Please add the location.';
    if (!p.configurations.length) return 'Pick at least one configuration (e.g. 2 BHK).';
    return '';
}

export async function saveProperty(env, input) {
    const p = normaliseProperty(input);
    const now = new Date().toISOString();
    const existing = p.id ? await getProperty(env, p.id) : null;

    if (!existing) {
        const record = { ...p, id: randomId('prop'), created_at: now, updated_at: now };
        await insertStatement(env, record).run();
        return getProperty(env, record.id);
    }

    await env.DB.prepare(`UPDATE properties SET
        title = ?, developer = ?, configurations = ?, price_lakhs = ?, price_onwards = ?, price_label = ?,
        carpet_area = ?, location = ?, city = ?, image_url = ?, image_path = ?, status = ?, featured = ?,
        rera = ?, sort_order = ?, updated_at = ? WHERE id = ?`)
        .bind(p.title, p.developer, JSON.stringify(p.configurations), p.price_lakhs, p.price_onwards ? 1 : 0,
            p.price_label, p.carpet_area, p.location, p.city, p.image_url, p.image_path, p.status,
            p.featured ? 1 : 0, p.rera, p.sort_order, now, p.id)
        .run();
    return getProperty(env, p.id);
}

export async function setPropertyStatus(env, id, status) {
    if (!STATUSES.includes(status)) return null;
    await env.DB.prepare('UPDATE properties SET status = ?, updated_at = ? WHERE id = ?')
        .bind(status, new Date().toISOString(), id).run();
    return getProperty(env, id);
}

export async function deleteProperty(env, id) {
    const existing = await getProperty(env, id);
    if (!existing) return null;
    await env.DB.prepare('DELETE FROM properties WHERE id = ?').bind(id).run();
    return existing;
}
