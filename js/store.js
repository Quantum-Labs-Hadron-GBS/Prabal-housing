/**
 * PRABAL HOUSING
 * Property data layer, shared by the public pages and the dashboard.
 *
 * Two modes:
 *  - LIVE: SUPABASE_URL + SUPABASE_ANON_KEY are set. Listings live in Supabase
 *    (see supabase/schema.sql and DASHBOARD_SETUP.md). Public pages read them
 *    with a single plain fetch — no client library on the public site.
 *  - DEMO: keys left empty. Listings are kept in this browser's localStorage so
 *    the dashboard can be tried locally. Nothing is shared with visitors.
 */

// ---------------------------------------------------------------------------
// SUPABASE CONFIG — paste from Supabase: Project Settings → API.
// The anon key is designed to be public; row-level security protects writes.
// ---------------------------------------------------------------------------
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';

const PrabalStore = (() => {
    'use strict';

    const LIVE = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
    const TABLE = 'properties';
    const BUCKET = 'property-images';
    const DEMO_KEY = 'prabal_demo_properties_v1';

    const STATUS = {
        available: 'Available',
        new_launch: 'New launch',
        closed: 'Closed'
    };

    const CONFIG_OPTIONS = ['Studio', '1 BHK', '2 BHK', '3 BHK', '4 BHK', '5+ BHK', 'Villa', 'Plot', 'Commercial'];

    // ---- helpers -----------------------------------------------------------

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    // Only allow images from http(s) or data URLs we produced ourselves.
    function safeImageURL(url) {
        if (!url) return '';
        const s = String(url);
        if (/^https:\/\//i.test(s) || /^data:image\/(webp|jpeg|png);base64,/i.test(s)) return s;
        return '';
    }

    function formatPrice(p) {
        if (p.price_lakhs == null || p.price_lakhs === '' || Number(p.price_lakhs) <= 0) return 'Price on request';
        const lakhs = Number(p.price_lakhs);
        const trim = n => n.toFixed(2).replace(/\.?0+$/, '');
        const label = lakhs >= 100 ? `₹${trim(lakhs / 100)} Cr` : `₹${trim(lakhs)} L`;
        return p.price_onwards ? `${label} onwards` : label;
    }

    // Normalise a record coming from the DB or a form
    function normalise(p) {
        return {
            id: p.id,
            title: (p.title || '').trim(),
            developer: (p.developer || '').trim(),
            configurations: Array.isArray(p.configurations) ? p.configurations.filter(Boolean) : [],
            price_lakhs: p.price_lakhs === '' || p.price_lakhs == null ? null : Number(p.price_lakhs),
            price_onwards: Boolean(p.price_onwards),
            location: (p.location || '').trim(),
            city: (p.city || 'Pune').trim(),
            image_url: p.image_url || '',
            image_path: p.image_path || '',
            status: STATUS[p.status] ? p.status : 'available',
            featured: Boolean(p.featured),
            rera: (p.rera || '').trim(),
            sort_order: Number(p.sort_order) || 0,
            created_at: p.created_at || new Date().toISOString()
        };
    }

    // Open listings first (featured, then newest), closed ones last
    function sortListings(list) {
        return list.slice().sort((a, b) =>
            (a.status === 'closed') - (b.status === 'closed') ||
            (b.featured - a.featured) ||
            (a.sort_order - b.sort_order) ||
            String(b.created_at).localeCompare(String(a.created_at)));
    }

    // ---- demo storage ------------------------------------------------------

    const DEMO_SEED = [
        { title: 'Godrej River Crest', developer: 'Godrej Properties', configurations: ['3 BHK'], price_lakhs: 250, location: 'Kalyani Nagar', status: 'available', featured: true, image_url: 'https://picsum.photos/seed/prop1/1200/800' },
        { title: 'Lodha Bellagio', developer: 'Lodha Group', configurations: ['4 BHK'], price_lakhs: 420, location: 'Koregaon Park', status: 'new_launch', featured: true, image_url: 'https://picsum.photos/seed/prop2/1200/800' },
        { title: 'Mahindra Citadel', developer: 'Mahindra Lifespaces', configurations: ['2 BHK', '3 BHK'], price_lakhs: 110, price_onwards: true, location: 'Pimpri', status: 'available', featured: true, image_url: 'https://picsum.photos/seed/prop3/1200/800' },
        { title: 'Kohinoor Presidentia', developer: 'Kohinoor', configurations: ['3 BHK'], price_lakhs: 180, location: 'Sopan Baug Annexe', status: 'closed', image_url: 'https://picsum.photos/seed/prop4/1200/800' },
        { title: 'Godrej Horizon', developer: 'Godrej Properties', configurations: ['Studio', '1 BHK'], price_lakhs: 45, price_onwards: true, location: 'Undri', status: 'available', image_url: 'https://picsum.photos/seed/prop6/1200/800' }
    ];

    function demoRead() {
        try {
            const raw = localStorage.getItem(DEMO_KEY);
            if (raw) return JSON.parse(raw).map(normalise);
        } catch (err) { /* fall through to seed */ }
        const seeded = DEMO_SEED.map((p, i) => normalise({
            ...p, id: `demo-${i + 1}`, created_at: new Date(Date.now() - i * 864e5).toISOString()
        }));
        demoWrite(seeded);
        return seeded;
    }

    // Set once someone actually edits listings in the demo dashboard
    const DEMO_EDITED = 'prabal_demo_edited';
    function markDemoEdited() {
        try { localStorage.setItem(DEMO_EDITED, '1'); } catch (err) { /* ignore */ }
    }
    function demoEdited() {
        try { return localStorage.getItem(DEMO_EDITED) === '1'; } catch (err) { return false; }
    }

    function demoWrite(list) {
        try {
            localStorage.setItem(DEMO_KEY, JSON.stringify(list));
        } catch (err) {
            throw new Error('Browser storage is full. In demo mode photos are stored locally — try a smaller photo or connect Supabase.');
        }
    }

    // ---- public read (no library) -----------------------------------------

    async function listPublic() {
        if (!LIVE) return sortListings(demoRead());
        const url = `${SUPABASE_URL}/rest/v1/${TABLE}?select=*&order=created_at.desc`;
        const res = await fetch(url, {
            headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` }
        });
        if (!res.ok) throw new Error(`Could not load properties (${res.status})`);
        return sortListings((await res.json()).map(normalise));
    }

    // ---- admin (dashboard) -------------------------------------------------

    let client = null;

    function loadScript(src) {
        return new Promise((resolve, reject) => {
            const s = document.createElement('script');
            s.src = src;
            s.onload = resolve;
            s.onerror = () => reject(new Error('Could not load Supabase client'));
            document.head.appendChild(s);
        });
    }

    async function getClient() {
        if (!LIVE) return null;
        if (client) return client;
        if (!window.supabase) await loadScript('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.117.2/dist/umd/supabase.js');
        client = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
        return client;
    }

    const admin = {
        async session() {
            if (!LIVE) return sessionStorage.getItem('prabal_demo_session') ? { user: { email: 'demo@prabalhousing.com' } } : null;
            const sb = await getClient();
            const { data } = await sb.auth.getSession();
            return data.session;
        },

        async signIn(email, password) {
            if (!LIVE) {
                sessionStorage.setItem('prabal_demo_session', '1');
                return { user: { email: email || 'demo@prabalhousing.com' } };
            }
            const sb = await getClient();
            const { data, error } = await sb.auth.signInWithPassword({ email, password });
            if (error) throw new Error(error.message === 'Invalid login credentials' ? 'Wrong email or password.' : error.message);
            return data.session;
        },

        async signOut() {
            if (!LIVE) return sessionStorage.removeItem('prabal_demo_session');
            const sb = await getClient();
            await sb.auth.signOut();
        },

        async list() {
            if (!LIVE) return sortListings(demoRead());
            const sb = await getClient();
            const { data, error } = await sb.from(TABLE).select('*').order('created_at', { ascending: false });
            if (error) throw new Error(error.message);
            return sortListings(data.map(normalise));
        },

        async save(record) {
            const p = normalise(record);
            if (!p.title) throw new Error('Please add the project name.');
            if (!p.location) throw new Error('Please add the location.');
            if (!p.configurations.length) throw new Error('Pick at least one configuration (e.g. 2 BHK).');

            if (!LIVE) {
                const list = demoRead();
                const i = list.findIndex(x => x.id === p.id);
                if (i >= 0) list[i] = { ...list[i], ...p };
                else list.unshift({ ...p, id: `demo-${Date.now()}`, created_at: new Date().toISOString() });
                demoWrite(list);
                markDemoEdited();
                return p;
            }

            const sb = await getClient();
            const { id, created_at, ...fields } = p;
            const query = id
                ? sb.from(TABLE).update(fields).eq('id', id).select().single()
                : sb.from(TABLE).insert(fields).select().single();
            const { data, error } = await query;
            if (error) throw new Error(friendlyDbError(error));
            return normalise(data);
        },

        async setStatus(id, status) {
            if (!LIVE) {
                const list = demoRead();
                const p = list.find(x => x.id === id);
                if (p) p.status = status;
                demoWrite(list);
                markDemoEdited();
                return;
            }
            const sb = await getClient();
            const { error } = await sb.from(TABLE).update({ status }).eq('id', id);
            if (error) throw new Error(friendlyDbError(error));
        },

        async remove(property) {
            if (!LIVE) {
                demoWrite(demoRead().filter(x => x.id !== property.id));
                markDemoEdited();
                return;
            }
            const sb = await getClient();
            const { error } = await sb.from(TABLE).delete().eq('id', property.id);
            if (error) throw new Error(friendlyDbError(error));
            if (property.image_path) await sb.storage.from(BUCKET).remove([property.image_path]);
        },

        // Resize + convert to WebP in the browser before upload: a 6 MB phone
        // photo becomes ~150 KB, which keeps the public site fast.
        async uploadPhoto(file) {
            const blob = await compressImage(file, LIVE ? 1600 : 1000, LIVE ? 0.82 : 0.7);
            if (!LIVE) {
                return { url: await blobToDataURL(blob), path: '' };
            }
            const sb = await getClient();
            const path = `listings/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.webp`;
            const { error } = await sb.storage.from(BUCKET).upload(path, blob, { contentType: 'image/webp', cacheControl: '31536000' });
            if (error) throw new Error(friendlyDbError(error));
            const { data } = sb.storage.from(BUCKET).getPublicUrl(path);
            return { url: data.publicUrl, path };
        },

        async removePhoto(path) {
            if (!LIVE || !path) return;
            const sb = await getClient();
            await sb.storage.from(BUCKET).remove([path]);
        }
    };

    function friendlyDbError(error) {
        const msg = error.message || String(error);
        if (/row-level security|permission denied|not authorized|Unauthorized/i.test(msg)) {
            return 'Your account is not set up as an admin yet. See DASHBOARD_SETUP.md, step 4.';
        }
        return msg;
    }

    function compressImage(file, maxSide, quality) {
        return new Promise((resolve, reject) => {
            if (!/^image\//.test(file.type)) return reject(new Error('Please choose an image file.'));
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
                const canvas = document.createElement('canvas');
                canvas.width = Math.round(img.width * scale);
                canvas.height = Math.round(img.height * scale);
                canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
                URL.revokeObjectURL(url);
                canvas.toBlob(b => b ? resolve(b) : reject(new Error('Could not process this image.')), 'image/webp', quality);
            };
            img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read this image.')); };
            img.src = url;
        });
    }

    function blobToDataURL(blob) {
        return new Promise(resolve => {
            const r = new FileReader();
            r.onload = () => resolve(r.result);
            r.readAsDataURL(blob);
        });
    }

    return { LIVE, demoEdited, STATUS, CONFIG_OPTIONS, escapeHTML, safeImageURL, formatPrice, listPublic, admin };
})();

window.PrabalStore = PrabalStore;
