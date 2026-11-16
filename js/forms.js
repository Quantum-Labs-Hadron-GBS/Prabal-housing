/**
 * PRABAL HOUSING
 * Sends the Contact and Careers forms to the website backend (/api/forms/<type>),
 * which saves them for the dashboard and emails them to the team.
 *
 * Mark a form with data-form="contact" or data-form="career".
 */

(function () {
    'use strict';

    const MAX_FILE = 5 * 1024 * 1024;
    const WHATSAPP = '918956603548';

    const THANKS = {
        contact: ['Thank you{name}!', 'Your message has reached our team. An advisor will call you shortly, usually within a few working hours.'],
        career: ['Application received{name}!', "Thank you for your interest in PRABALHOUSING. Our team will review your profile and get in touch if there's a match."]
    };

    function statusEl(form) {
        let el = form.querySelector('.form-status');
        if (!el) {
            el = document.createElement('p');
            el.className = 'form-status';
            el.setAttribute('role', 'alert');
            el.hidden = true;
            form.querySelector('[type=submit]').before(el);
        }
        return el;
    }

    function showError(form, message, withFallback) {
        const el = statusEl(form);
        el.innerHTML = '';
        el.append(message);
        if (withFallback) {
            const a = document.createElement('a');
            a.href = `https://wa.me/${WHATSAPP}`;
            a.target = '_blank';
            a.rel = 'noopener';
            a.textContent = 'WhatsApp us';
            el.append(' You can also ', a, '.');
        }
        el.hidden = false;
    }

    function addHoneypot(form) {
        // Hidden from people (and screen readers); bots that fill every field get ignored.
        const wrap = document.createElement('div');
        wrap.setAttribute('aria-hidden', 'true');
        wrap.style.cssText = 'position:absolute;left:-9999px;width:1px;height:1px;overflow:hidden;';
        wrap.innerHTML = '<label>Website <input type="text" name="website" tabindex="-1" autocomplete="off"></label>';
        form.append(wrap);
    }

    function validPhone(value) {
        const d = String(value || '').replace(/\D/g, '').replace(/^(91|0)(?=[6-9]\d{9}$)/, '');
        return /^[6-9]\d{9}$/.test(d) || (d.length >= 8 && d.length <= 15 && /^\+/.test(String(value).trim()));
    }

    function init(form) {
        const type = form.dataset.form;
        form.setAttribute('novalidate', '');
        form.removeAttribute('action');
        addHoneypot(form);

        form.addEventListener('submit', async e => {
            e.preventDefault();
            statusEl(form).hidden = true;

            // Native checks for required fields / email format, then our own phone + file checks
            if (!form.checkValidity()) {
                form.reportValidity();
                return;
            }
            const phone = form.querySelector('[type=tel]');
            if (phone && !validPhone(phone.value)) {
                phone.focus();
                return showError(form, 'Please enter a valid 10-digit mobile number.');
            }
            const file = form.querySelector('[type=file]')?.files?.[0];
            if (file && file.size > MAX_FILE) return showError(form, 'Your résumé must be under 5 MB.');

            const data = new FormData(form);
            // Send what the visitor saw ("₹1 Cr - ₹2 Cr"), not internal option values
            form.querySelectorAll('select[name]').forEach(sel => {
                const opt = sel.selectedOptions[0];
                if (opt && opt.value) data.set(sel.name, opt.textContent.trim());
            });
            data.set('page', window.location.href.split('#')[0]);

            const btn = form.querySelector('[type=submit]');
            const label = btn.textContent;
            btn.disabled = true;
            btn.textContent = file ? 'Uploading...' : 'Sending...';

            try {
                const res = await fetch(`/api/forms/${type}`, { method: 'POST', body: data, headers: { Accept: 'application/json' } });
                const body = await res.json().catch(() => ({}));
                if (!res.ok) throw Object.assign(new Error(body.error || 'Something went wrong.'), { status: res.status });

                const first = (data.get('fullName') || data.get('name') || '').toString().trim().split(' ')[0];
                const [title, text] = THANKS[type] || THANKS.contact;
                const done = document.createElement('div');
                done.className = 'form-success';
                done.setAttribute('role', 'status');
                done.innerHTML = '<h3></h3><p></p>';
                done.querySelector('h3').textContent = title.replace('{name}', first ? `, ${first}` : '');
                done.querySelector('p').textContent = text;
                form.replaceWith(done);
                done.scrollIntoView({ behavior: 'smooth', block: 'center' });
                try { if (window.va) window.va('event', { name: 'form_submit', data: { type } }); } catch (err) { /* ignore */ }
            } catch (err) {
                // 4xx = something the visitor can fix; anything else = our problem, offer WhatsApp
                const fixable = err.status >= 400 && err.status < 500 && err.status !== 404;
                showError(form, fixable ? err.message : 'Sorry, we could not send your message just now.', !fixable || err.status === 429);
            } finally {
                btn.disabled = false;
                btn.textContent = label;
            }
        });
    }

    document.querySelectorAll('form[data-form]').forEach(init);
})();
