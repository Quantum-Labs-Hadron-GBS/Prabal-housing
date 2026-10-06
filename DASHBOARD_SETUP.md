# Property dashboard — setup

The dashboard lives at **/dashboard**. Staff sign in there to add, edit, close
or delete property listings. Changes appear on **/properties** (and the
homepage "Residences" section) for every visitor immediately.

Until the steps below are done the dashboard runs in **demo mode**: it works,
but listings are saved only in your own browser.

## 1. Create a Supabase project (free)

1. Go to <https://supabase.com>, sign up and click **New project**.
2. Pick a region close to India (e.g. *Mumbai*), set a database password and create it.

## 2. Create the tables

1. In the project, open **SQL Editor → New query**.
2. Paste the whole of [`supabase/schema.sql`](supabase/schema.sql) and click **Run**.

This creates the `properties` table, the `admins` list, the photo bucket and
the security rules (anyone can view listings; only admins can change them).

## 3. Lock down sign-ups and add your team

1. **Authentication → Providers → Email**: keep Email enabled, and under
   **Authentication → Sign In / Providers** turn **off "Allow new users to sign up"**.
2. **Authentication → Users → Add user → Create new user**: enter the staff
   member's email and a strong password (tick *Auto confirm*).

## 4. Make them an admin

In **SQL Editor**, run (with the real email):

```sql
insert into public.admins (user_id)
select id from auth.users where email = 'staff@prabalhousing.com';
```

Repeat steps 3.2 and 4 for each person who needs dashboard access. To remove
access, delete the user under **Authentication → Users**.

## 5. Connect the website

1. **Project Settings → API**: copy the **Project URL** and the **anon public** key.
2. Paste them at the top of `js/store.js`:

```js
const SUPABASE_URL = 'https://xxxxxxxx.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOi...';
```

3. Deploy. Visit `/dashboard`, sign in, and add your first property.

> The anon key is meant to be public. Security comes from the row-level
> security rules in step 2 — never paste the `service_role` key into the site.

## Notes

- Photos are resized and converted to WebP in the browser before upload
  (a 6 MB phone photo becomes roughly 150 KB), so the site stays fast.
- Marking a listing **Closed** puts a "Closed" stamp on its photo and hides the
  exact price behind an "Ask us" prompt.
- **Featured** listings are shown first, including on the homepage.
