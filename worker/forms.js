// Website form submissions → saved in D1 (dashboard "Enquiries") → emailed to the team.
//
// Every submission is stored first, so nothing is lost even if email is down;
// the email is sent in the background and its outcome recorded on the row.

import { Buffer } from 'node:buffer';
import { HttpError, clean, clientIP, escapeHTML, isEmail, json, randomId, rateLimited } from './util.js';
import { mailConfigured, sendMail } from './mail.js';

// Field order here is the order they appear in the email.
const FORMS = {
    contact: {
        label: 'Website enquiry',
        fields: [
            ['fullName', 'Name', { required: true, max: 100 }],
            ['mobileNumber', 'Mobile', { required: true, phone: true }],
            ['emailId', 'Email', { email: true }],
            ['lookingFor', 'Looking for', { max: 60 }],
            ['budget', 'Budget', { max: 60 }],
            ['message', 'Message', { max: 3000, multiline: true }]
        ],
        who: d => ({ name: d.fullName, phone: d.mobileNumber, email: d.emailId }),
        subject: d => `New enquiry: ${d.fullName} · ${d.mobileNumber}`
    },
    // Homepage "shortlist" form (currently not on the page, kept for when it returns)
    shortlist: {
        label: 'Shortlist request',
        fields: [
            ['name', 'Name', { required: true, max: 100 }],
            ['phone', 'Mobile', { required: true, phone: true }],
            ['bhk', 'Looking for', { max: 60 }],
            ['budget', 'Budget', { max: 60 }],
            ['area', 'Area', { max: 120 }],
            ['message', 'Message', { max: 3000, multiline: true }]
        ],
        who: d => ({ name: d.name, phone: d.phone, email: '' }),
        subject: d => `Shortlist request: ${d.name} · ${d.phone}`
    },
    career: {
        label: 'Job application',
        fields: [
            ['fullName', 'Name', { required: true, max: 100 }],
            ['email', 'Email', { required: true, email: true }],
            ['phone', 'Phone', { required: true, phone: true }],
            ['position', 'Position', { required: true, max: 120 }],
            ['dob', 'Date of birth', { max: 20 }],
            ['pan', 'PAN', { max: 10, upper: true }],
            ['source', 'Heard about us via', { max: 60 }],
            ['referrer', 'Referred by', { max: 100 }],
            ['education', 'Latest education', { max: 160 }],
            ['eduYear', 'Passing date', { max: 20 }],
            ['expRange', 'Experience range', { max: 40 }],
            ['totalExp', 'Total experience (yrs)', { max: 10 }],
            ['relevantExp', 'Relevant experience (yrs)', { max: 10 }],
            ['techWorkedOn', 'Skills / tools', { max: 500 }]
        ],
        file: { field: 'resume', label: 'Résumé', required: true, maxBytes: 5 * 1024 * 1024 },
        who: d => ({ name: d.fullName, phone: d.phone, email: d.email }),
        subject: d => `Job application: ${d.fullName} · ${d.position}`
    }
};

const FILE_TYPES = {
    pdf: { mime: 'application/pdf', magic: [0x25, 0x50, 0x44, 0x46] },                         // %PDF
    docx: { mime: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', magic: [0x50, 0x4b] }, // PK (zip)
    doc: { mime: 'application/msword', magic: [0xd0, 0xcf, 0x11, 0xe0] }                       // OLE
};

function normalisePhone(value) {
    const digits = String(value || '').replace(/\D/g, '');
    const local = digits.length === 12 && digits.startsWith('91') ? digits.slice(2)
        : digits.length === 11 && digits.startsWith('0') ? digits.slice(1) : digits;
    if (/^[6-9]\d{9}$/.test(local)) return `+91 ${local}`;
    if (digits.length >= 8 && digits.length <= 15) return `+${digits}`; // international
    return '';
}

async function readSubmission(request) {
    const type = request.headers.get('Content-Type') || '';
    if (type.includes('multipart/form-data') || type.includes('application/x-www-form-urlencoded')) {
        return request.formData();
    }
    if (type.includes('application/json')) {
        const body = await request.json().catch(() => ({}));
        const fd = new FormData();
        for (const [k, v] of Object.entries(body || {})) fd.append(k, String(v ?? ''));
        return fd;
    }
    throw new HttpError(415, 'Unsupported form encoding.');
}

function validate(spec, fd) {
    const data = {};
    for (const [name, label, rule] of spec.fields) {
        let v = clean(fd.get(name), rule.max || 200);
        if (rule.upper) v = v.toUpperCase();
        if (rule.phone && v) {
            v = normalisePhone(v);
            if (!v) throw new HttpError(400, `Please enter a valid ${label.toLowerCase()} number.`);
        }
        if (rule.email && v && !isEmail(v)) throw new HttpError(400, 'Please enter a valid email address.');
        if (rule.required && !v) throw new HttpError(400, `Please fill in ${label.toLowerCase()}.`);
        if (v) data[name] = v;
    }
    return data;
}

async function readFile(spec, fd) {
    const f = spec.file;
    if (!f) return null;
    const file = fd.get(f.field);
    if (!file || typeof file === 'string' || !file.size) {
        if (f.required) throw new HttpError(400, 'Please attach your résumé.');
        return null;
    }
    if (file.size > f.maxBytes) throw new HttpError(413, 'Your résumé must be under 5 MB.');

    const ext = (file.name.match(/\.([a-z0-9]+)$/i)?.[1] || '').toLowerCase();
    const kind = FILE_TYPES[ext];
    if (!kind) throw new HttpError(400, 'Please upload your résumé as a PDF, DOC or DOCX file.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    if (!kind.magic.every((b, i) => bytes[i] === b)) throw new HttpError(400, "That file doesn't look like a real PDF or Word document.");

    const safeName = file.name.replace(/[^\w.\- ]+/g, '').replace(/\s+/g, ' ').trim().slice(-80) || `resume.${ext}`;
    return { bytes, name: safeName, mime: kind.mime };
}

function buildEmail(spec, data, meta) {
    const rows = spec.fields
        .filter(([name]) => data[name])
        .map(([name, label, rule]) => {
            const value = escapeHTML(data[name]);
            const shown = rule.phone ? `<a href="tel:${value.replace(/\s/g, '')}">${value}</a>`
                : rule.email ? `<a href="mailto:${value}">${value}</a>`
                : rule.multiline ? value.replace(/\n/g, '<br>') : value;
            return `<tr><td style="padding:8px 14px 8px 0;color:#777;vertical-align:top;white-space:nowrap">${escapeHTML(label)}</td>
                    <td style="padding:8px 0;color:#111">${shown}</td></tr>`;
        }).join('');

    const extra = [
        meta.fileName ? `Résumé attached: ${escapeHTML(meta.fileName)}` : '',
        meta.page ? `Sent from: ${escapeHTML(meta.page)}` : '',
        `Received: ${escapeHTML(meta.when)} (IST)`
    ].filter(Boolean).map(s => `<div>${s}</div>`).join('');

    const html = `<!doctype html><html><body style="margin:0;padding:24px;background:#f6f4f1;font-family:Arial,Helvetica,sans-serif;font-size:15px">
        <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:8px;padding:28px">
            <div style="font-size:12px;letter-spacing:.12em;text-transform:uppercase;color:#F17943;margin-bottom:6px">${escapeHTML(spec.label)}</div>
            <h1 style="margin:0 0 18px;font-size:20px;color:#111">${escapeHTML(meta.name || 'New submission')}</h1>
            <table style="border-collapse:collapse;width:100%">${rows}</table>
            <div style="margin-top:22px;padding-top:14px;border-top:1px solid #eee;font-size:12px;color:#999;line-height:1.7">${extra}</div>
        </div></body></html>`;

    const text = [
        spec.label.toUpperCase(),
        ...spec.fields.filter(([n]) => data[n]).map(([n, label]) => `${label}: ${data[n]}`),
        '',
        meta.fileName ? `Résumé attached: ${meta.fileName}` : '',
        meta.page ? `Sent from: ${meta.page}` : '',
        `Received: ${meta.when} (IST)`
    ].filter(s => s !== null).join('\n');

    return { html, text };
}

export async function handleForm(request, env, ctx, type) {
    const spec = FORMS[type];
    if (!spec) throw new HttpError(404, 'Unknown form.');

    const fd = await readSubmission(request);

    // Honeypot: real visitors never see or fill this field. Pretend it worked.
    if (clean(fd.get('website'))) return json({ ok: true });

    const data = validate(spec, fd);
    const file = await readFile(spec, fd);

    // Count only valid submissions, so a visitor fixing a typo isn't locked out
    if (await rateLimited(env, 'form', clientIP(request), 6, 600)) {
        throw new HttpError(429, 'You have sent several messages already. Please wait a few minutes, or call us directly.');
    }
    const who = spec.who(data);
    const id = randomId(type);
    const now = new Date();
    const page = clean(fd.get('page'), 300);

    let fileKey = '';
    if (file) {
        fileKey = `resumes/${now.toISOString().slice(0, 10)}/${id}-${file.name}`;
        await env.FILES.put(fileKey, file.bytes, { metadata: { contentType: file.mime } });
    }

    await env.DB.prepare(`INSERT INTO enquiries (id, type, name, email, phone, data, file_key, file_name, email_status, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`)
        .bind(id, type, who.name || '', who.email || '', who.phone || '', JSON.stringify({ ...data, page }),
            fileKey, file?.name || '', mailConfigured(env) ? 'pending' : 'not_configured', now.toISOString())
        .run();

    if (mailConfigured(env)) {
        const when = now.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' });
        const { html, text } = buildEmail(spec, data, { name: who.name, page, when, fileName: file?.name });
        ctx.waitUntil((async () => {
            let status = 'sent';
            let error = '';
            try {
                await sendMail(env, {
                    type,
                    subject: spec.subject(data),
                    html,
                    text,
                    replyTo: who.email && isEmail(who.email) ? who.email : undefined,
                    attachments: file ? [{ filename: file.name, content: Buffer.from(file.bytes).toString('base64') }] : []
                });
            } catch (err) {
                status = 'failed';
                error = String(err.message || err).slice(0, 500);
                console.error('Email failed', id, error);
            }
            await env.DB.prepare('UPDATE enquiries SET email_status = ?, email_error = ? WHERE id = ?').bind(status, error, id).run();
        })());
    }

    return json({ ok: true, id });
}

// ---- dashboard: enquiries -------------------------------------------------------

export async function listEnquiries(env, url) {
    const type = url.searchParams.get('type');
    const limit = Math.min(Number(url.searchParams.get('limit')) || 100, 500);
    const stmt = type && FORMS[type]
        ? env.DB.prepare('SELECT * FROM enquiries WHERE type = ? ORDER BY created_at DESC LIMIT ?').bind(type, limit)
        : env.DB.prepare('SELECT * FROM enquiries ORDER BY created_at DESC LIMIT ?').bind(limit);
    const { results } = await stmt.all();
    return results.map(r => {
        let data = {};
        try { data = JSON.parse(r.data); } catch { /* ignore */ }
        const spec = FORMS[r.type];
        const fields = spec ? spec.fields.filter(([n]) => data[n]).map(([n, label]) => ({ label, value: data[n] })) : [];
        return {
            id: r.id, type: r.type, typeLabel: spec?.label || r.type,
            name: r.name, email: r.email, phone: r.phone, fields, page: data.page || '',
            file_name: r.file_name, has_file: Boolean(r.file_key),
            email_status: r.email_status, email_error: r.email_error, created_at: r.created_at
        };
    });
}

export async function enquiryFile(env, id) {
    const row = await env.DB.prepare('SELECT file_key, file_name FROM enquiries WHERE id = ?').bind(id).first();
    if (!row?.file_key) throw new HttpError(404, 'No file for this enquiry.');
    const { value, metadata } = await env.FILES.getWithMetadata(row.file_key, { type: 'stream' });
    if (!value) throw new HttpError(404, 'File not found.');
    return new Response(value, {
        headers: {
            'Content-Type': metadata?.contentType || 'application/octet-stream',
            'Content-Disposition': `attachment; filename="${row.file_name.replace(/"/g, '')}"`,
            'Cache-Control': 'private, no-store',
            'X-Content-Type-Options': 'nosniff'
        }
    });
}

export async function deleteEnquiry(env, id) {
    const row = await env.DB.prepare('SELECT file_key FROM enquiries WHERE id = ?').bind(id).first();
    if (!row) return;
    if (row.file_key) await env.FILES.delete(row.file_key);
    await env.DB.prepare('DELETE FROM enquiries WHERE id = ?').bind(id).run();
}
