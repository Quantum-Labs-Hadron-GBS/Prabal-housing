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

    let setupMode = false;

    async function boot() {
        try {
            const st = await admin.status();
            st.user ? showApp(st.user) : showLogin('', st.needsSetup);
        } catch (err) {
            showLogin(err.message);
        }
    }

    function showLogin(message, needsSetup = false) {
        setupMode = needsSetup;
        document.querySelectorAll('[data-setup-only]').forEach(el => { el.hidden = !needsSetup; });
        $('login-sub').textContent = needsSetup ? 'Create the first admin account.' : 'Sign in to manage property listings.';
        $('login-submit').textContent = needsSetup ? 'Create admin & sign in' : 'Sign in';
        const pw = document.querySelector('#login-form [name=password]');
        pw.autocomplete = needsSetup ? 'new-password' : 'current-password';
        $('view-app').hidden = true;
        $('view-login').hidden = false;
        showError('login-error', message || '');
        document.querySelector(needsSetup ? '#login-form [name=setupKey]' : '#login-form [name=email]').focus();
    }

    async function showApp(user) {
        $('view-login').hidden = true;
        $('view-app').hidden = false;
        $('dash-user').textContent = user?.email || '';
        const pf = $('password-form');
        if (pf) pf.elements.username.value = user?.email || '';
        showView(viewFromHash());
        await refresh();
        loadEnquiryCount();
    }

    // Any request that comes back 401 means the session ended: go back to sign-in
    function handleAuthError(err) {
        if (err && err.status === 401) {
            showLogin(err.message);
            return true;
        }
        return false;
    }

    // ---- auth -----------------------------------------------------------------

    $('login-form').addEventListener('submit', async e => {
        e.preventDefault();
        const form = e.target;
        const email = form.email.value.trim();
        const password = form.password.value;
        showError('login-error', '');
        if (!email || !password) return showError('login-error', 'Enter your email and password.');
        if (setupMode) {
            if (!form.setupKey.value.trim()) return showError('login-error', 'Enter the setup key.');
            if (password.length < 10) return showError('login-error', 'Use a password of at least 10 characters.');
            if (password !== form.confirm.value) return showError('login-error', "The two passwords don't match.");
        }

        const btn = $('login-submit');
        const label = btn.textContent;
        btn.disabled = true;
        btn.textContent = setupMode ? 'Creating account...' : 'Signing in...';
        try {
            const { user } = setupMode
                ? await admin.setup(form.setupKey.value.trim(), email, password)
                : await admin.signIn(email, password);
            form.reset();
            showApp(user);
        } catch (err) {
            if (err.status === 409) showLogin(err.message, false); // someone already completed setup
            else showError('login-error', err.message);
        } finally {
            btn.disabled = false;
            btn.textContent = label;
        }
    });

    $('sign-out').addEventListener('click', async () => {
        await admin.signOut();
        showLogin();
    });

    // ---- views (Listings / Enquiries / Team) ------------------------------------

    const VIEWS = ['listings', 'enquiries', 'team'];
    const viewFromHash = () => (VIEWS.includes(location.hash.slice(1)) ? location.hash.slice(1) : 'listings');

    function showView(view) {
        VIEWS.forEach(v => { $(`panel-${v}`).hidden = v !== view; });
        $('dash-nav').querySelectorAll('[data-view]').forEach(a => {
            const on = a.dataset.view === view;
            a.classList.toggle('is-active', on);
            if (on) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
        });
        if (view === 'enquiries') loadEnquiries();
        if (view === 'team') loadTeam();
    }

    window.addEventListener('hashchange', () => {
        if (!$('view-app').hidden) showView(viewFromHash());
    });

    // ---- list -------------------------------------------------------------------

    async function refresh() {
        $('dash-list').innerHTML = '<div class="dash-loading">Loading listings...</div>';
        try {
            state.listings = await admin.list();
            render();
        } catch (err) {
            if (handleAuthError(err)) return;
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
                if (handleAuthError(err)) return;
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
            if (!handleAuthError(err)) toast(err.message, true);
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
            price_label: f.price_label.value,
            carpet_area: f.carpet_area.value,
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
        f.price_label.value = p?.price_label || '';
        f.carpet_area.value = p?.carpet_area || '';
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
            if (err.status === 401) {
                showError('form-error', 'Your session has ended. Sign in again in a new tab, then click save again.');
            } else {
                showError('form-error', err.message);
            }
        } finally {
            btn.disabled = false;
            btn.textContent = label;
        }
    });

    // ---- enquiries ---------------------------------------------------------------------

    const enq = { list: [], type: '', search: '', loaded: false };
    const SEEN_KEY = 'prabal_enquiries_seen';

    const fmtDate = iso => new Date(iso).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });

    function lastSeen() {
        try { return localStorage.getItem(SEEN_KEY) || ''; } catch (err) { return ''; }
    }

    async function loadEnquiryCount() {
        try {
            const list = await admin.enquiries();
            const seen = lastSeen();
            const fresh = list.filter(x => x.created_at > seen).length;
            const badge = $('enquiry-count');
            badge.textContent = fresh > 99 ? '99+' : String(fresh);
            badge.hidden = !fresh || !seen;
        } catch (err) { /* badge is optional */ }
    }

    async function loadEnquiries() {
        if (!enq.loaded) $('enquiry-list').innerHTML = '<div class="dash-loading">Loading enquiries...</div>';
        try {
            enq.list = await admin.enquiries();
            enq.loaded = true;
            renderEnquiries();
            try { if (enq.list[0]) localStorage.setItem(SEEN_KEY, enq.list[0].created_at); } catch (err) { /* ignore */ }
            $('enquiry-count').hidden = true;
        } catch (err) {
            if (handleAuthError(err)) return;
            $('enquiry-list').innerHTML = `<div class="dash-empty"><p>${esc(err.message)}</p></div>`;
        }
    }

    const MAIL_STATUS = {
        sent: ['Emailed', 'available'],
        pending: ['Sending…', 'new_launch'],
        failed: ['Email failed', 'closed'],
        not_configured: ['Email not set up', 'closed']
    };

    function renderEnquiries() {
        const q = enq.search.toLowerCase();
        const list = enq.list.filter(x =>
            (!enq.type || x.type === enq.type) &&
            (!q || [x.name, x.phone, x.email, ...x.fields.map(f => f.value)].join(' ').toLowerCase().includes(q)));

        if (!list.length) {
            $('enquiry-list').innerHTML = `<div class="dash-empty"><p>${enq.list.length
                ? 'No enquiries match this filter.'
                : 'No enquiries yet. When someone fills in the contact or careers form, it shows up here and in your inbox.'}</p></div>`;
            return;
        }

        $('enquiry-list').innerHTML = list.map(x => {
            const [mailLabel, mailClass] = MAIL_STATUS[x.email_status] || [x.email_status, 'closed'];
            const phoneDigits = (x.phone || '').replace(/[^\d+]/g, '');
            const details = x.fields
                .filter(f => !['Name', 'Mobile', 'Phone', 'Email'].includes(f.label))
                .map(f => `<div><dt>${esc(f.label)}</dt><dd>${esc(f.value)}</dd></div>`).join('');
            return `
            <article class="enquiry" data-enquiry="${esc(x.id)}">
                <header class="enquiry-head">
                    <div>
                        <span class="pill pill--${x.type === 'career' ? 'feat' : 'new_launch'}">${esc(x.typeLabel)}</span>
                        <h3>${esc(x.name || 'No name')}</h3>
                        <p class="enquiry-contact">
                            ${x.phone ? `<a href="tel:${esc(phoneDigits)}">${esc(x.phone)}</a>` : ''}
                            ${x.phone ? `<a href="https://wa.me/${esc(phoneDigits.replace(/^\+/, ''))}" target="_blank" rel="noopener">WhatsApp</a>` : ''}
                            ${x.email ? `<a href="mailto:${esc(x.email)}">${esc(x.email)}</a>` : ''}
                        </p>
                    </div>
                    <div class="enquiry-meta">
                        <time datetime="${esc(x.created_at)}">${esc(fmtDate(x.created_at))}</time>
                        <span class="pill pill--${mailClass}" ${x.email_error ? `title="${esc(x.email_error)}"` : ''}>${esc(mailLabel)}</span>
                    </div>
                </header>
                ${details ? `<dl class="enquiry-fields">${details}</dl>` : ''}
                <footer class="enquiry-foot">
                    ${x.has_file ? `<a class="dash-btn dash-btn--ghost dash-btn--sm" href="${esc(admin.enquiryFileURL(x.id))}">Download ${esc(x.file_name || 'résumé')}</a>` : ''}
                    ${x.page ? `<span class="field-hint">From ${esc(x.page.replace(/^https?:\/\/[^/]+/, '') || '/')}</span>` : ''}
                    <button type="button" class="icon-btn" data-enquiry-delete aria-label="Delete enquiry from ${esc(x.name)}" title="Delete">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>
                    </button>
                </footer>
            </article>`;
        }).join('');
    }

    $('enquiries-refresh').addEventListener('click', loadEnquiries);
    $('enquiry-search').addEventListener('input', e => { enq.search = e.target.value.trim(); renderEnquiries(); });
    $('enquiry-tabs').addEventListener('click', e => {
        const btn = e.target.closest('[data-type]');
        if (!btn) return;
        enq.type = btn.dataset.type;
        $('enquiry-tabs').querySelectorAll('.seg-btn').forEach(b => b.classList.toggle('is-active', b === btn));
        renderEnquiries();
    });
    $('enquiry-list').addEventListener('click', async e => {
        const btn = e.target.closest('[data-enquiry-delete]');
        if (!btn) return;
        const card = btn.closest('[data-enquiry]');
        const item = enq.list.find(x => x.id === card.dataset.enquiry);
        if (!item || !window.confirm(`Delete the enquiry from ${item.name || 'this person'}? This can't be undone.`)) return;
        btn.disabled = true;
        try {
            await admin.deleteEnquiry(item.id);
            enq.list = enq.list.filter(x => x.id !== item.id);
            renderEnquiries();
            toast('Enquiry deleted.');
        } catch (err) {
            if (!handleAuthError(err)) toast(err.message, true);
            btn.disabled = false;
        }
    });

    // ---- team -------------------------------------------------------------------------

    async function loadTeam() {
        $('team-list').innerHTML = '<div class="dash-loading">Loading...</div>';
        try {
            const { me, team } = await admin.team();
            $('team-list').innerHTML = team.map(m => `
                <div class="team-row" data-member="${esc(m.id)}">
                    <div>
                        <strong>${esc(m.email)}</strong>${m.email === me ? ' <span class="pill pill--available">You</span>' : ''}
                        <small>Added ${esc(fmtDate(m.created_at))}${m.created_by && m.created_by !== 'setup' ? ` by ${esc(m.created_by)}` : ''}</small>
                    </div>
                    ${m.email === me ? '' : `<button type="button" class="dash-btn dash-btn--ghost dash-btn--sm" data-member-remove>Remove</button>`}
                </div>`).join('');
        } catch (err) {
            if (handleAuthError(err)) return;
            $('team-list').innerHTML = `<p class="dash-error">${esc(err.message)}</p>`;
        }
    }

    $('team-list').addEventListener('click', async e => {
        const btn = e.target.closest('[data-member-remove]');
        if (!btn) return;
        const row = btn.closest('[data-member]');
        const email = row.querySelector('strong').textContent;
        if (!window.confirm(`Remove ${email}? They will be signed out and can no longer use the dashboard.`)) return;
        btn.disabled = true;
        try {
            await admin.removeMember(row.dataset.member);
            toast(`${email} removed.`);
            loadTeam();
        } catch (err) {
            if (!handleAuthError(err)) toast(err.message, true);
            btn.disabled = false;
        }
    });

    $('team-form').addEventListener('submit', async e => {
        e.preventDefault();
        const f = e.target;
        showError('team-error', '');
        const btn = f.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
            await admin.addMember(f.email.value.trim(), f.password.value);
            toast(`${f.email.value.trim()} can now sign in.`);
            f.reset();
            loadTeam();
        } catch (err) {
            if (!handleAuthError(err)) showError('team-error', err.message);
        } finally {
            btn.disabled = false;
        }
    });

    $('password-form').addEventListener('submit', async e => {
        e.preventDefault();
        const f = e.target;
        showError('password-error', '');
        const btn = f.querySelector('button[type=submit]');
        btn.disabled = true;
        try {
            await admin.changePassword(f.current.value, f.next.value);
            const username = f.username.value;
            f.reset();
            f.username.value = username;
            toast('Password updated.');
        } catch (err) {
            if (!handleAuthError(err)) showError('password-error', err.message);
        } finally {
            btn.disabled = false;
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
