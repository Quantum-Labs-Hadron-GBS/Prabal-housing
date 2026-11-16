# Backend: dashboard, listings and form emails

The site runs on one Cloudflare Worker (`prabal-housing`):

| What | Where |
|---|---|
| Website pages, CSS, JS, images | Served as static files from this folder |
| `/api/*` | `worker/index.js` |
| Listings, admin accounts, enquiries | Cloudflare **D1** database `prabal-housing-db` |
| Uploaded listing photos and résumés | Cloudflare **Workers KV** (created automatically) |
| Notification emails | **Resend** (resend.com) |

**What the team gets**

- **/dashboard**: staff sign in to add, edit, close or delete listings. Changes appear on /properties and the homepage immediately.
- **Contact and careers forms**: every submission is saved and emailed to the team. Résumés are attached to the email. The dashboard's **Enquiries** tab keeps a copy of everything, even if an email fails.
- **Team tab**: add or remove people who can sign in, and change your own password.

The database tables are created automatically on the first request. On that first run, the current `data/properties.json` is copied in, so the site keeps its listings. After that, **the dashboard is the source of truth**: editing `data/properties.json` no longer changes the site. That file is only a fallback when the API can't be reached.

---

## One-time setup

Everything runs on Cloudflare's **free Workers plan**. No payment card is needed: D1 and Workers KV are both included.

### 1. Deploy

Push to the branch Workers Builds deploys from, or run `npx wrangler deploy`. On the first deploy, Wrangler **creates the D1 database and the KV namespace automatically**.

> If the build fails while creating them, create them yourself in the Cloudflare dashboard:
> - **Storage & databases → D1 → Create database**, named `prabal-housing-db`. Add `"database_id": "<its id>"` next to `database_name` in `wrangler.jsonc`.
> - **Storage & databases → Workers KV → Create namespace**, named `prabal-housing-files`. Add `"id": "<its id>"` next to `"binding": "FILES"` in `wrangler.jsonc`.
>
> Then deploy again.

### 2. Add the settings

**Workers & Pages → prabal-housing → Settings → Variables and Secrets → Add**. Choose type **Secret** for each one:

| Name | Value |
|---|---|
| `SETUP_KEY` | Any long random string. Used once, to create the first admin. |
| `NOTIFY_EMAIL` | Inbox that receives enquiries, e.g. `info@prabalhousing.com`. Separate several addresses with commas. |
| `CAREERS_EMAIL` | *(optional)* A different inbox for job applications. |
| `RESEND_API_KEY` | From step 3. |
| `MAIL_FROM` | *(optional)* Defaults to `PRABALHOUSING Website <website@prabalhousing.com>`. |

Deploys never overwrite these values (`keep_vars` is on in `wrangler.jsonc`).

### 3. Set up email sending (Resend)

Our mailboxes run on Microsoft 365. Resend only adds records for **sending**, so it doesn't affect Outlook.

1. Sign up at <https://resend.com> → **Domains → Add domain** → `prabalhousing.com`.
2. Resend shows about 3 DNS records: a `resend._domainkey` TXT, plus an MX and a TXT on `send`. Add each one in **Cloudflare → prabalhousing.com → DNS → Records**, set to **DNS only** (grey cloud).
   - **Do not** change the existing root MX record or the `v=spf1 include:spf.protection.outlook.com` record. Outlook needs them.
3. Click **Verify** in Resend. It usually takes a few minutes.
4. **API Keys → Create API key** with *Sending access*. Paste it into `RESEND_API_KEY` (step 2).

### 4. Create the first admin

Open **https://prabalhousing.com/dashboard**. With no admins yet, it shows **First-time setup**. Enter the `SETUP_KEY`, your email and a password of 10 or more characters. After that, the setup screen never appears again. Add everyone else from the **Team** tab.

### 5. Test it

Send a message from /contact. It should appear under **Dashboard → Enquiries** marked **Emailed**, and arrive in the `NOTIFY_EMAIL` inbox. If it shows **Email failed**, hover over the label to see Resend's error. The usual cause is a domain that isn't verified yet.

---

## Local development

```bash
npm install
cp .dev.vars.example .dev.vars   # fill in SETUP_KEY etc.; leave RESEND_API_KEY empty to skip email
npm run dev                      # http://localhost:8787 (uses a local throwaway database)
```

## Backups

```bash
npx wrangler d1 export prabal-housing-db --remote --output backup.sql
```

## Security notes

- Passwords are hashed (PBKDF2-SHA256). Sessions use HttpOnly, Secure, SameSite=Strict cookies and expire after 14 days.
- Sign-in is limited to 8 attempts per 15 minutes. Forms are limited to 6 submissions per visitor per 10 minutes and have a hidden spam trap.
- Résumés are never public. Only signed-in admins can download them.
- Careers applications include PAN numbers and dates of birth. Delete old applications from the Enquiries tab once they're no longer needed.
