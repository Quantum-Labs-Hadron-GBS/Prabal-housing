/**
 * PRABAL HOUSING
 * Renders live property listings (from js/store.js) on the public pages:
 *   - /properties : full grid with working filters
 *   - homepage    : up to three listings in "The Residences"
 */

(function () {
    'use strict';

    const S = window.PrabalStore;
    if (!S) return;
    const esc = S.escapeHTML;

    const BHK_FILTER = {
        studio: ['Studio'], '1bhk': ['1 BHK'], '2bhk': ['2 BHK'], '3bhk': ['3 BHK'],
        '4bhk': ['4 BHK'], '5bhk': ['5+ BHK', 'Villa']
    };

    const BUDGET_FILTER = {
        'under-1cr': p => p.price_lakhs != null && p.price_lakhs < 100,
        '1cr-3cr': p => p.price_lakhs >= 100 && p.price_lakhs <= 300,
        '3cr-5cr': p => p.price_lakhs > 300 && p.price_lakhs <= 500,
        'above-5cr': p => p.price_lakhs > 500
    };

    function bhkSlug(configs) {
        const c = configs.find(x => /BHK|Studio/.test(x)) || '';
        if (c === 'Studio') return 'studio';
        const m = c.match(/^(\d)/);
        return m ? `${m[1]}bhk` : '';
    }

    function enquiryLink(p, closed, onHomepage) {
        if (onHomepage) return '#get-shortlist';
        const message = closed
            ? `Hi, I saw ${p.title} (${p.location}) is closed. Please share similar options.`
            : `Hi, I'm interested in ${p.title} at ${p.location}. Please share the best price.`;
        const params = new URLSearchParams({ message, bhk: bhkSlug(p.configurations) });
        return `/contact?${params.toString()}`;
    }

    function cardHTML(p, { onHomepage = false } = {}) {
        const closed = p.status === 'closed';
        const img = S.safeImageURL(p.image_url);
        const price = S.formatPrice(p);
        // Closed deals keep their price private: a blurred placeholder invites the question.
        const priceHTML = closed
            ? `<span class="listing-price listing-price--hidden" aria-label="Final price on request">
                   <span class="price-blur" aria-hidden="true">${esc(price.replace(/\d/g, '•'))}</span>
                   <small>Ask what it closed at</small>
               </span>`
            : `<span class="listing-price">${esc(price)}</span>`;

        const badges = [
            p.status === 'new_launch' ? '<span class="listing-badge listing-badge--new">New launch</span>' : '',
            p.featured && !closed ? '<span class="listing-badge">Featured</span>' : ''
        ].join('');

        const ctaLabel = closed ? 'Get similar homes &rarr;' : 'Get best price &rarr;';
        const area = esc(p.location);

        return `
        <article class="listing-card${closed ? ' is-closed' : ''}">
            <div class="listing-media">
                ${img ? `<img src="${esc(img)}" alt="${esc(p.title)} in ${area}" loading="lazy" decoding="async">` : '<div class="listing-noimg" aria-hidden="true"></div>'}
                <div class="listing-badges">${badges}</div>
                ${closed ? `<div class="closed-stamp" aria-label="Closed">
                    <span class="closed-stamp-main">Closed</span>
                    <span class="closed-stamp-sub">by Prabal</span>
                </div>` : ''}
            </div>
            <div class="listing-body">
                <p class="listing-meta">${esc([p.developer, p.configurations.join(' · ')].filter(Boolean).join(' • '))}</p>
                <h3 class="listing-title">${esc(p.title)}</h3>
                <p class="listing-location">${area}${p.city ? `, ${esc(p.city)}` : ''}</p>
                ${p.rera ? `<p class="listing-rera">RERA ${esc(p.rera)}</p>` : ''}
                <div class="listing-foot">
                    ${priceHTML}
                    <a class="btn-link listing-cta" href="${esc(enquiryLink(p, closed, onHomepage))}"
                       data-area="${area}" data-bhk="${esc(bhkSlug(p.configurations))}"
                       data-track="${closed ? 'listing_similar' : 'listing_enquire'}">${ctaLabel}</a>
                </div>
            </div>
        </article>`;
    }

    // Stamp lands with a "thump" when it scrolls into view
    function animateStamps(root) {
        const stamps = root.querySelectorAll('.listing-card.is-closed');
        if (!('IntersectionObserver' in window)) return stamps.forEach(s => s.classList.add('stamped'));
        const io = new IntersectionObserver(entries => entries.forEach(e => {
            if (e.isIntersecting) {
                e.target.classList.add('stamped');
                io.unobserve(e.target);
            }
        }), { threshold: 0.5 });
        stamps.forEach(s => io.observe(s));
    }

    // ---- /properties --------------------------------------------------------
    async function initPropertiesPage(grid) {
        const form = document.getElementById('property-filters');
        const countEl = document.getElementById('listings-count');
        const builderSelect = document.getElementById('filter-builder');
        let all = [];

        try {
            all = await S.listPublic();
        } catch (err) {
            grid.innerHTML = `<p class="listings-empty">We couldn't load the latest properties. Please refresh, or
                <a href="/contact">ask an advisor</a> directly.</p>`;
            return;
        }

        // Builder options come from the actual listings
        if (builderSelect) {
            const builders = [...new Set(all.map(p => p.developer).filter(Boolean))].sort();
            builderSelect.innerHTML = '<option value="">Builder</option>' +
                builders.map(b => `<option value="${esc(b)}">${esc(b)}</option>`).join('');
        }

        const apply = () => {
            const data = form ? Object.fromEntries(new FormData(form).entries()) : {};
            const q = (data.q || '').trim().toLowerCase();
            const list = all.filter(p =>
                (!q || [p.title, p.location, p.city, p.developer].join(' ').toLowerCase().includes(q)) &&
                (!data.budget || (BUDGET_FILTER[data.budget] || (() => true))(p)) &&
                (!data.bhk || p.configurations.some(c => (BHK_FILTER[data.bhk] || []).includes(c))) &&
                (!data.builder || p.developer === data.builder));

            const open = list.filter(p => p.status !== 'closed').length;
            if (countEl) {
                countEl.textContent = list.length
                    ? `${open} available${list.length - open ? ` · ${list.length - open} recently closed` : ''}`
                    : '';
            }

            grid.innerHTML = list.length
                ? list.map(p => cardHTML(p)).join('')
                : `<div class="listings-empty">
                       <p>Nothing matches those filters right now — but new projects come to us before they're public.</p>
                       <a class="btn-premium btn-solid" href="/contact?message=${encodeURIComponent('Hi, please tell me about upcoming projects that match my needs.')}">Get early access</a>
                   </div>`;
            animateStamps(grid);
        };

        if (form) {
            form.addEventListener('submit', e => { e.preventDefault(); apply(); });
            form.addEventListener('change', apply);
            let t;
            form.addEventListener('input', e => {
                if (e.target.name !== 'q') return;
                clearTimeout(t);
                t = setTimeout(apply, 200);
            });
        }
        apply();
    }

    // ---- homepage -------------------------------------------------------------
    async function initHomepage(grid) {
        // Before Supabase is connected, keep the designed static cards for real
        // visitors; only swap if this browser has used the demo dashboard.
        if (!S.LIVE && !S.demoEdited()) return;
        let list;
        try {
            list = await S.listPublic();
        } catch (err) {
            return; // keep the static cards
        }
        const open = list.filter(p => p.status !== 'closed');
        if (!open.length) return;

        // Up to three open listings, plus one closed deal as social proof when there's room
        const picks = open.slice(0, 3);
        const closed = list.find(p => p.status === 'closed');
        if (picks.length < 3 && closed) picks.push(closed);

        grid.classList.add('cards-grid--listings');
        grid.innerHTML = picks.map(p => cardHTML(p, { onHomepage: true })).join('');
        animateStamps(grid);

        const more = document.getElementById('residences-more');
        if (more) more.hidden = false;
    }

    // Shared with the dashboard's live preview
    window.PrabalListings = { cardHTML, animateStamps };

    function init() {
        const page = document.getElementById('listings-grid');
        if (page) initPropertiesPage(page);
        const home = document.getElementById('home-listings');
        if (home) initHomepage(home);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
