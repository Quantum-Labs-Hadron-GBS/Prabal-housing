// Outgoing email via Resend (https://resend.com).
//
// Settings (Cloudflare dashboard → Worker → Settings → Variables and Secrets):
//   RESEND_API_KEY  secret, from resend.com → API Keys
//   NOTIFY_EMAIL    who receives website enquiries, comma-separated for several
//   CAREERS_EMAIL   optional: separate inbox for job applications
//   MAIL_FROM       optional, e.g. "PRABALHOUSING Website <website@prabalhousing.com>"
//                   (must be on a domain verified in Resend)

export function mailConfigured(env) {
    return Boolean(env.RESEND_API_KEY && env.NOTIFY_EMAIL);
}

function recipients(env, type) {
    const list = (type === 'career' && env.CAREERS_EMAIL) ? env.CAREERS_EMAIL : env.NOTIFY_EMAIL;
    return String(list || '').split(',').map(s => s.trim()).filter(Boolean);
}

// attachments: [{ filename, content: base64 string }]
export async function sendMail(env, { type, subject, html, text, replyTo, attachments }) {
    if (!mailConfigured(env)) throw new Error('Email is not set up yet (RESEND_API_KEY / NOTIFY_EMAIL missing).');

    const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${env.RESEND_API_KEY}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            from: env.MAIL_FROM || 'PRABALHOUSING Website <website@prabalhousing.com>',
            to: recipients(env, type),
            subject,
            html,
            text,
            ...(replyTo ? { reply_to: replyTo } : {}),
            ...(attachments?.length ? { attachments } : {})
        })
    });

    if (!res.ok) {
        const detail = await res.text().catch(() => '');
        throw new Error(`Resend ${res.status}: ${detail.slice(0, 300)}`);
    }
}
