/**
 * PRABAL HOUSING
 * Team dashboard: sign in, then add / edit / close / delete property listings.
 */

(function () {
    'use strict';

    const S = window.PrabalStore;
    const { admin, escapeHTML: esc } = S;
    const $ = id => document.getElementById(id);

    const state = {
        listings: [],
        filter: '',
        search: '',
        configs: [],
        photo: { file: null, previewURL: '', url: '', path: '', removed: false },
        editing: null,
        pendingDelete: null
    };

    // ---- boot ---------------------------------------------------------------

    document.querySelectorAll('[data-demo-only]').forEach(el => { el.hidden = S.LIVE; });

    async function boot() {
        try {
            const session = await admin.session();
            session ? showApp(session) : showLogin();
        } catch (err) {
            showLogin(err.message);
        }
    }

    function showLogin(message) {
        $('view-app').hidden = true;
        $('view-login').hidden = false;
        if (message) showError('login-error', message);
        document.querySelector('#login-form [name=email]').focus();
    }

    async function showApp(session) {
        $('view-login').hidden = true;
        $('view-app').hidden = false;
        $('dash-user').textContent = session?.user?.email || '';
        await refresh();
    }

    // ---- auth -----------------------------------------------------------------

    $('login-form').addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.target;
        const email = form.email.value.trim();
        const password = form.password.value;
        showError('login-error', '');
        if (S.LIVE && (!email || !password)) return showError('login-error', 'Enter your email and password.');

        const btn = $('login-submit');
        btn.disabled = true;
        btn.textContent = 'Signing in...';
        try {
            const session = await admin.signIn(email, password);
            form.password.value = '';
            showApp(session);
        } catch (err) {
            showError('login-error', err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = 'Sign in';
        }
    });

    $('sign-out').addEventListener('click', async () => {
        await admin.signOut();
        showLogin();
    });

    // ---- list -------------------------------------------------------------------

    async function refresh() {
        $('dash-list').innerHTML = '<div class="dash-loading">Loading listings...</div>';
        try {
            state.listings = await admin.list();
            render();
        } catch (err) {
            $('dash-list').innerHTML = `<div class="dash-empty"><p>${esc(err.message)}</p></div>`;
        }
    }

    function render() {
        const all = state.listings;
        const count = s => all.filter(p => p.status === s).length;
        $('dash-stats').innerHTML = [
            ['Total listings', all.length],
            ['Available', count('available')],
            ['New launch', count('new_launch')],
            ['Closed', count('closed')]
        ].map(([label, n]) => `<div class="stat"><strong>${n}</strong><span>${label}</span></div>`).join('');

        const q = state.search.toLowerCase();
        const list = all.filter(p =>
            (!state.filter || p.status === state.filter) &&
            (!q || [p.title, p.location, p.city, p.developer].join(' ').toLowerCase().includes(q)));

        if (!list.length) {
            $('dash-list').innerHTML = all.length
                ? '<div class="dash-empty"><p>No listings match this filter.</p></div>'
                : `<div class="dash-empty">
                       <p>No properties yet. Add your first one — it will appear on the website right away.</p>
                       <button class="dash-btn dash-btn--primary" type="button" data-action="add">+ Add property</button>
                   </div>`;
            return;
        }

        $('dash-list').innerHTML = list.map(p => {
            const img = S.safeImageURL(p.image_url);
            const closed = p.status === 'closed';
            return `
            <article class="row${closed ? ' row--closed' : ''}" data-id="${esc(p.id)}">
                <div class="row-thumb">${img ? `<img src="${esc(img)}" alt="" loading="lazy">` : ''}
                    ${closed ? '<span class="row-stamp">Closed</span>' : ''}</div>
                <div class="row-main">
                    <h3>${esc(p.title)} ${p.featured ? '<span class="pill pill--feat">Featured</span>' : ''}</h3>
                    <p>${esc([p.configurations.join(', '), p.location + (p.city ? `, ${p.city}` : ''), p.developer].filter(Boolean).join(' · '))}</p>
                </div>
                <div class="row-price">${esc(S.formatPrice(p))}</div>
                <div class="row-status"><span class="pill pill--${esc(p.status)}">${esc(S.STATUS[p.status])}</span></div>
                <div class="row-actions">
                    <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-action="edit">Edit</button>
                    <button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-action="toggle-closed">${closed ? 'Reopen' : 'Mark closed'}</button>
                    <button type="button" class="icon-btn" data-action="delete" aria-label="Delete ${esc(p.title)}" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
                    </button>
                </div>
            </article>`;
        }).join('');
    }

    $('dash-search').addEventListener('input', e => { state.search = e.target.value.trim(); render(); });

    $('status-tabs').addEventListener('click', e => {
        const btn = e.target.closest('[data-status]');
        if (!btn) return;
        state.filter = btn.dataset.status;
        $('status-tabs').querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('is-active', b === btn));
        render();
    });

    document.addEventListener('click', async e => {
        const btn = e.target.closest('[data-action]');
        if (!btn) return;
        const action = btn.dataset.action;
        if (action === 'add') return openEditor();
        const row = btn.closest('[data-id]');
        const p = row && state.listings.find(x => x.id === row.dataset.id);
        if (!p) return;

        if (action === 'edit') openEditor(p);
        if (action === 'delete') confirmDelete(p);
        if (action === 'toggle-closed') {
            const next = p.status === 'closed' ? 'available' : 'closed';
            btn.disabled = true;
            try {
                await admin.setStatus(p.id, next);
                toast(next === 'closed' ? `${p.title} marked closed — stamp added.` : `${p.title} is open again.`);
                await refresh();
            } catch (err) {
                toast(err.message, true);
                btn.disabled = false;
            }
        }
    });

    $('add-property').addEventListener('click', () => openEditor());

    // ---- delete -------------------------------------------------------------------

    function confirmDelete(p) {
        state.pendingDelete = p;
        $('confirm-text').textContent = `"${p.title}" will be removed from the website immediately. This can't be undone.`;
        $('confirm-close-instead').hidden = p.status === 'closed';
        $('confirm-dialog').showModal();
    }

    $('confirm-dialog').addEventListener('close', async () => {
        const choice = $('confirm-dialog').returnValue;
        const p = state.pendingDelete;
        state.pendingDelete = null;
        if (!p) return;
        try {
            if (choice === 'delete') {
                await admin.remove(p);
                toast(`${p.title} deleted.`);
            } else if (choice === 'close') {
                await admin.setStatus(p.id, 'closed');
                toast(`${p.title} marked closed.`);
            } else {
                return;
            }
            await refresh();
        } catch (err) {
            toast(err.message, true);
        }
    });

    // ---- editor -------------------------------------------------------------------

    const form = $('property-form');

    function renderChips() {
        const all = [...new Set([...S.CONFIG_OPTIONS, ...state.configs])];
        $('config-chips').innerHTML = all.map(c =>
            `<button type="button" class="chip${state.configs.includes(c) ? ' is-on' : ''}" data-config="${esc(c)}"
                aria-pressed="${state.configs.includes(c)}">${esc(c)}</button>`).join('');
    }

    $('config-chips').addEventListener('click', e => {
        const chip = e.target.closest('[data-config]');
        if (!chip) return;
        const c = chip.dataset.config;
        state.configs = state.configs.includes(c) ? state.configs.filter(x => x !== c) : [...state.configs, c];
        renderChips();
        updatePreview();
    });

    function addCustomConfig() {
        const input = $('config-custom');
        let v = input.value.trim().replace(/\s+/g, ' ');
        if (!v) return;
        v = v.replace(/^(\d+(\.\d+)?)\s*bhk$/i, '$1 BHK');
        if (!state.configs.includes(v)) state.configs.push(v);
        input.value = '';
        renderChips();
        updatePreview();
    }
    $('config-add').addEventListener('click', addCustomConfig);
    $('config-custom').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); addCustomConfig(); }
    });

    function setPhotoPreview(src) {
        const img = $('photo-preview');
        img.hidden = !src;
        if (src) img.src = src; else img.removeAttribute('src');
        $('dropzone').classList.toggle('has-photo', Boolean(src));
        $('photo-remove').hidden = !src;
    }

    function pickFile(file) {
        if (!file) return;
        if (!/^image\//.test(file.type)) return showError('form-error', 'Please choose an image file.');
        if (state.photo.previewURL) URL.revokeObjectURL(state.photo.previewURL);
        state.photo.file = file;
        state.photo.previewURL = URL.createObjectURL(file);
        state.photo.removed = false;
        setPhotoPreview(state.photo.previewURL);
        updatePreview();
    }

    $('photo-input').addEventListener('change', e => pickFile(e.target.files[0]));
    const dz = $('dropzone');
    ['dragenter', 'dragover'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.add('is-drag'); }));
    ['dragleave', 'drop'].forEach(ev => dz.addEventListener(ev, e => { e.preventDefault(); dz.classList.remove('is-drag'); }));
    dz.addEventListener('drop', e => pickFile(e.dataTransfer.files[0]));

    $('photo-remove').addEventListener('click', () => {
        state.photo.file = null;
        state.photo.removed = true;
        $('photo-input').value = '';
        setPhotoPreview('');
        updatePreview();
    });

    function readForm() {
        const f = form.elements;
        const onRequest = f.price_on_request.checked;
        const raw = parseFloat(f.price.value);
        const lakhs = onRequest || !(raw > 0) ? null : (f.unit.value === 'cr' ? raw * 100 : raw);
        return {
            id: f.id.value || undefined,
            title: f.title.value,
            developer: f.developer.value,
            configurations: state.configs.slice(),
            price_lakhs: lakhs == null ? null : Math.round(lakhs * 100) / 100,
            price_onwards: f.price_onwards.checked && !onRequest,
            location: f.location.value,
            city: f.city.value || 'Pune',
            status: f.status.value,
            featured: f.featured.checked,
            rera: f.rera.value,
            sort_order: state.editing?.sort_order || 0,
            created_at: state.editing?.created_at
        };
    }

    function updatePreview() {
        const p = readForm();
        const previewImg = state.photo.previewURL || (state.photo.removed ? '' : state.photo.url);
        const card = {
            ...p,
            title: p.title || 'Project name',
            location: p.location || 'Location',
            configurations: p.configurations.length ? p.configurations : ['Configuration'],
            image_url: previewImg
        };
        // The preview uses a blob: URL, which safeImageURL (rightly) rejects — swap it in after rendering.
        const holder = $('card-preview');
        holder.innerHTML = window.PrabalListings.cardHTML({ ...card, image_url: previewImg.startsWith('blob:') ? '' : previewImg });
        if (previewImg.startsWith('blob:')) {
            const media = holder.querySelector('.listing-media');
            const ph = media.querySelector('.listing-noimg');
            const img = document.createElement('img');
            img.src = previewImg;
            img.alt = '';
            if (ph) ph.replaceWith(img); else media.prepend(img);
        }
        holder.querySelector('.listing-card')?.classList.add('stamped');
        form.elements.price.disabled = form.elements.price_on_request.checked;
        form.elements.unit.disabled = form.elements.price_on_request.checked;
        $('status-seg').querySelectorAll('.seg-btn').forEach(l => l.classList.toggle('is-active', l.querySelector('input').checked));
    }

    form.addEventListener('input', updatePreview);
    form.addEventListener('change', updatePreview);

    function openEditor(p) {
        state.editing = p || null;
        form.reset();
        showError('form-error', '');
        $('drawer-title').textContent = p ? 'Edit property' : 'Add property';
        $('save-btn').textContent = p ? 'Save changes' : 'Add to website';

        const f = form.elements;
        f.id.value = p?.id || '';
        f.title.value = p?.title || '';
        f.developer.value = p?.developer || '';
        f.location.value = p?.location || '';
        f.city.value = p?.city || 'Pune';
        f.rera.value = p?.rera || '';
        f.featured.checked = Boolean(p?.featured);
        f.price_onwards.checked = Boolean(p?.price_onwards);
        f.price_on_request.checked = Boolean(p) && p.price_lakhs == null;
        if (p?.price_lakhs != null) {
            const cr = p.price_lakhs >= 100;
            f.unit.value = cr ? 'cr' : 'l';
            f.price.value = cr ? +(p.price_lakhs / 100).toFixed(2) : p.price_lakhs;
        }
        form.querySelector(`[name=status][value="${p?.status || 'available'}"]`).checked = true;

        state.configs = p ? p.configurations.slice() : [];
        if (state.photo.previewURL) URL.revokeObjectURL(state.photo.previewURL);
        state.photo = { file: null, previewURL: '', url: p?.image_url || '', path: p?.image_path || '', removed: false };
        $('photo-input').value = '';
        setPhotoPreview(S.safeImageURL(state.photo.url));
        renderChips();
        updatePreview();

        $('drawer').classList.add('is-open');
        $('drawer').setAttribute('aria-hidden', 'false');
        $('drawer-backdrop').hidden = false;
        document.body.classList.add('drawer-open');
        setTimeout(() => f.title.focus(), 250);
    }

    function closeEditor() {
        $('drawer').classList.remove('is-open');
        $('drawer').setAttribute('aria-hidden', 'true');
        $('drawer-backdrop').hidden = true;
        document.body.classList.remove('drawer-open');
        state.editing = null;
    }

    $('drawer-close').addEventListener('click', closeEditor);
    $('drawer-cancel').addEventListener('click', closeEditor);
    $('drawer-backdrop').addEventListener('click', closeEditor);
    document.addEventListener('keydown', e => {
        if (e.key === 'Escape' && $('drawer').classList.contains('is-open')) closeEditor();
    });

    form.addEventListener('submit', async e => {
        e.preventDefault();
        showError('form-error', '');
        const record = readForm();
        const btn = $('save-btn');
        const label = btn.textContent;
        btn.disabled = true;

        const oldPath = state.photo.path;
        let uploadedPath = '';
        try {
            if (state.photo.file) {
                btn.textContent = 'Uploading photo...';
                const up = await admin.uploadPhoto(state.photo.file);
                uploadedPath = up.path;
                record.image_url = up.url;
                record.image_path = up.path;
            } else if (state.photo.removed) {
                record.image_url = '';
                record.image_path = '';
            } else {
                record.image_url = state.photo.url;
                record.image_path = state.photo.path;
            }

            btn.textContent = 'Saving...';
            await admin.save(record);

            // Clean up a replaced/removed photo only after the save succeeded
            if (oldPath && (state.photo.file || state.photo.removed)) admin.removePhoto(oldPath);

            toast(record.id ? 'Changes saved — live on the website.' : `${record.title.trim()} added to the website.`);
            closeEditor();
            await refresh();
        } catch (err) {
            if (uploadedPath) admin.removePhoto(uploadedPath);
            showError('form-error', err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = label;
        }
    });

    // ---- ui helpers ------------------------------------------------------------------

    function showError(id, message) {
        const el = $(id);
        el.textContent = message || '';
        el.hidden = !message;
    }

    let toastTimer;
    function toast(message, isError) {
        const el = $('toast');
        el.textContent = message;
        el.classList.toggle('toast--error', Boolean(isError));
        el.hidden = false;
        requestAnimationFrame(() => el.classList.add('is-visible'));
        clearTimeout(toastTimer);
        toastTimer = setTimeout(() => {
            el.classList.remove('is-visible');
            setTimeout(() => { el.hidden = true; }, 300);
        }, 3200);
    }

    boot();
})();
