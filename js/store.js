/**
 * PRABAL HOUSING
 * Property data layer, shared by the public pages and the dashboard.
 *
 * Listings live in the Cloudflare Worker's D1 database (see worker/ and
 * BACKEND.md). Public pages read GET /api/properties; the dashboard uses the
 * signed-in /api/admin/* routes. If the API can't be reached (e.g. the site is
 * opened from a plain static server) public pages fall back to the snapshot in
 * data/properties.json so they never show an empty grid.
 */

const PrabalStore = (() => {
    'use strict';

    const STATUS = {
        available: 'Available',
        new_launch: 'New launch',
        closed: 'Closed'
    };

    const CONFIG_OPTIONS = ['Studio', '1 BHK', '2 BHK', '2.5 BHK', '3 BHK', '3.5 BHK', '4 BHK', '5+ BHK', 'Villa', 'Plot', 'Commercial'];

    // ---- helpers -----------------------------------------------------------

    function escapeHTML(value) {
        return String(value ?? '').replace(/[&<>"']/g, ch => ({
            '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
        }[ch]));
    }

    // Only allow https images, our own /images files, and photos uploaded via the dashboard.
    function safeImageURL(url) {
        if (!url) return '';
        const s = String(url);
        if (/^https:\/\//i.test(s) ||
            /^\/?images\/[a-zA-Z0-9_.\-\/]+\.(?:png|jpe?g|webp|gif|svg)$/i.test(s) ||
            /^\/api\/media\/listings\/[a-zA-Z0-9_.\-]+$/.test(s)) return s;
        return '';
    }

    function formatPrice(p) {
        if (p.price_label) return p.price_label;
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
            price_label: (p.price_label || '').trim(),
            carpet_area: (p.carpet_area || '').trim(),
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

    // ---- API ---------------------------------------------------------------

    async function api(path, { method = 'GET', body, headers = {} } = {}) {
        const isJSON = body !== undefined && !(body instanceof Blob);
        let res;
        try {
            res = await fetch(path, {
                method,
                credentials: 'same-origin',
                cache: 'no-store',
                headers: { Accept: 'application/json', ...(isJSON ? { 'Content-Type': 'application/json' } : {}), ...headers },
                body: isJSON ? JSON.stringify(body) : body
            });
        } catch (err) {
            throw new Error('Could not reach the server. Check your internet connection and try again.');
        }
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
            const error = new Error(data.error || `Request failed (${res.status})`);
            error.status = res.status;
            throw error;
        }
        return data;
    }

    // ---- public read -------------------------------------------------------

    async function listPublic() {
        try {
            const list = await api('/api/properties');
            if (Array.isArray(list)) return sortListings(list.map(normalise));
        } catch (err) { /* fall back to the static snapshot */ }
        const res = await fetch('/data/properties.json');
        if (!res.ok) throw new Error(`Could not load properties (${res.status})`);
        return sortListings((await res.json()).map(normalise));
    }

    // ---- admin (dashboard) -------------------------------------------------

    const admin = {
        // { user: {email} | null, needsSetup: bool }
        status: () => api('/api/auth/status'),

        async signIn(email, password) {
            return api('/api/auth/login', { method: 'POST', body: { email, password } });
        },

        async setup(setupKey, email, password) {
            return api('/api/auth/setup', { method: 'POST', body: { setupKey, email, password } });
        },

        async signOut() {
            await api('/api/auth/logout', { method: 'POST', body: {} }).catch(() => {});
        },

        changePassword: (current, next) => api('/api/auth/password', { method: 'POST', body: { current, next } }),

        async list() {
            return sortListings((await api('/api/properties')).map(normalise));
        },

        async save(record) {
            const p = normalise(record);
            if (!p.title) throw new Error('Please add the project name.');
            if (!p.location) throw new Error('Please add the location.');
            if (!p.configurations.length) throw new Error('Pick at least one configuration (e.g. 2 BHK).');
            return normalise(await api('/api/admin/properties', { method: 'POST', body: p }));
        },

        async setStatus(id, status) {
            await api(`/api/admin/properties/${encodeURIComponent(id)}`, { method: 'PATCH', body: { status } });
        },

        async remove(property) {
            await api(`/api/admin/properties/${encodeURIComponent(property.id)}`, { method: 'DELETE' });
        },

        // Resize + convert to WebP in the browser before upload: a 6 MB phone
        // photo becomes ~150 KB, which keeps the public site fast.
        async uploadPhoto(file) {
            const blob = await compressImage(file, 1600, 0.82);
            return api('/api/admin/upload', { method: 'POST', body: blob, headers: { 'Content-Type': blob.type || 'image/webp' } });
        },

        async removePhoto(path) {
            if (!path) return;
            await api(`/api/admin/media/${path}`, { method: 'DELETE' }).catch(() => {});
        },

        enquiries: (type = '') => api(`/api/admin/enquiries${type ? `?type=${encodeURIComponent(type)}` : ''}`),
        deleteEnquiry: id => api(`/api/admin/enquiries/${encodeURIComponent(id)}`, { method: 'DELETE' }),
        enquiryFileURL: id => `/api/admin/enquiries/${encodeURIComponent(id)}/file`,

        team: () => api('/api/admin/team'),
        addMember: (email, password) => api('/api/admin/team', { method: 'POST', body: { email, password } }),
        removeMember: id => api(`/api/admin/team/${encodeURIComponent(id)}`, { method: 'DELETE' })
    };

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


    return { STATUS, CONFIG_OPTIONS, escapeHTML, safeImageURL, formatPrice, listPublic, admin };
})();

window.PrabalStore = PrabalStore;
