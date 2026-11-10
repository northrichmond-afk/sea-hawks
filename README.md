# Sea Hawks Cricket — coaching app

Tracks players, guardians and addresses, training sessions, attendance (marked by coaches), per-session fees, payments, and reports.

- **Website:** React (Vite), hosted on GitHub Pages
- **Database + sign-in:** Supabase. People can sign in with Google, or with email + password (with "forgot password").
- **Security:** enforced inside the database (Row Level Security), so the site only ever holds the public key

## Who can do what

| | Admin | Coach | Parent |
|---|---|---|---|
| Players, guardians, addresses | ✅ edit | names only | own children |
| Sessions (training dates) | ✅ create / cancel / set fee | view | own squad |
| Mark attendance | ✅ | ✅ | ❌ |
| Payments & balances | ✅ mark paid | ❌ | own children |
| Reports & CSV export | ✅ | ❌ | ❌ |

- **Admins/coaches** are added under *Settings → Staff access*.
- **Parents** don't need adding: anyone whose email matches a guardian record can sign in, with Google or with an email + password account they create themselves, and see only their own children.
- Any other account sees "No access yet".
- Email/password accounts get access only **after the person clicks the confirmation link** sent to their inbox. This stops anyone registering with someone else's email address.

## How fees work (monthly)
- Each squad has a **monthly fee** (Squads tab). A player can have their own amount instead, e.g. a sibling discount (on their player page).
- Once a month the admin opens **Payments** and presses **Raise [month] charges**. Every active player is charged that month's fee. Pressing it again later only charges players who were added since, so nobody is charged twice.
- To let a player off a month, open **Players → History → Fees & payments** and press **Waive**.
- Attendance is recorded for registers and reports only. It doesn't affect fees.
- **Balance** = fees charged − payments.
- Parents pay by bank transfer, using their child's reference (e.g. `SH012`). The admin then uses **Payments → Mark paid**. In *By family* view, one transfer for siblings is split across the children automatically.
- **Players → History** shows each player's attendance and a statement of fees and payments, both exportable to CSV.

---

## Setup (about 30 minutes, one time)

### 1. Supabase project
1. Go to <https://supabase.com> → **New project**. Choose region **London (eu-west-2)**.
2. Open **SQL Editor → New query**, paste all of [`supabase/schema.sql`](supabase/schema.sql), then click **Run**.
3. Add yourself as the first admin by running this, with your Google email:
   ```sql
   insert into public.app_users (email, full_name, role)
   values ('you@gmail.com', 'Your Name', 'admin');
   ```
4. *(Optional, testing only)* Edit the emails in [`supabase/seed_test_data.sql`](supabase/seed_test_data.sql) and run it to load **made-up** players.
5. Go to **Project Settings → API** and copy the **Project URL** and the **anon / publishable** key.
   ⚠️ Never use the `service_role` / secret key in this app.

### 2. Google sign-in
1. Go to <https://console.cloud.google.com> → create a project → **APIs & Services → OAuth consent screen**. Choose External, enter app name "Sea Hawks Cricket" and your support email, then save.
2. Go to **Credentials → Create credentials → OAuth client ID → Web application**.
   - **Authorised redirect URI:** `https://YOUR-PROJECT-ID.supabase.co/auth/v1/callback`
     (the exact value is shown in Supabase → Authentication → Providers → Google)
3. Copy the **Client ID** and **Client secret** into **Supabase → Authentication → Providers → Google**, turn it on, and save.
4. In **Supabase → Authentication → URL Configuration**:
   - **Site URL:** `https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPO/`
   - **Redirect URLs:** add the same URL, plus `http://localhost:5173/` for local testing
5. While the Google consent screen is in "Testing" mode, only the test users you add there can sign in. Click **Publish app** when parents start using it. Basic sign-in needs no Google review.

### 3. Email + password sign-in (for people without Google)
1. **Supabase → Authentication → Sign In / Providers → Email**: make sure it's **enabled**, and that **Confirm email is ON**.
   ⚠️ Never turn "Confirm email" off. It is what stops someone registering with a parent's email and seeing their child's details.
2. In the same place, set the **minimum password length to 8**. If it's offered, also turn on leaked-password protection.
3. **Set up an email sender (required).** Supabase's built-in email only reaches your own team's addresses and sends very few emails per hour, so parents won't get confirmation or reset emails without this.
   - Create a free account with an email service (e.g. Resend, Brevo or Mailgun) and verify your domain or sender address with them.
   - In **Supabase → Authentication → Emails → SMTP Settings**, turn on custom SMTP and enter the host, port, username, password and sender name ("Sea Hawks Cricket") they give you.
4. **Make the email links work on any device.** By default, a link only works in the same browser the request was made from (a parent who asks on a laptop but opens the email on their phone would get stuck). In **Supabase → Authentication → Emails → Templates**:
   - **Confirm signup**: replace the link with
     ```html
     <h2>Welcome to Sea Hawks Cricket</h2>
     <p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=email">Confirm your email address</a></p>
     ```
   - **Reset password**: replace the link with
     ```html
     <h2>Reset your Sea Hawks password</h2>
     <p><a href="{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=recovery">Choose a new password</a></p>
     <p>If you didn't ask for this, you can ignore this email.</p>
     ```
5. Test it: create an account with a spare email, click the confirmation link, sign in, then try **Forgot password?**

How it works for a parent:
- **Create an account** → a confirmation email arrives → they click it → they sign in with their email and password.
- **Forgot password?** → they enter their email → a reset email arrives → they click it → they choose a new password and are signed in.
- They must use the **same email the club has on the guardian record**.

### 4. GitHub Pages
1. Create a GitHub repo (e.g. `sea-hawks`) and push this folder to the `main` branch.
2. Go to **Settings → Secrets and variables → Actions → Variables tab** and add:
   - `VITE_SUPABASE_URL` = your Project URL
   - `VITE_SUPABASE_ANON_KEY` = your anon / publishable key
3. Go to **Settings → Pages → Source: GitHub Actions**.
4. Go to **Actions → Deploy to GitHub Pages → Run workflow** (it also runs on every push).
   The site appears at `https://YOUR-GITHUB-USERNAME.github.io/YOUR-REPO/`.

> On a free GitHub plan the repo must be **public** for Pages. That's OK: the code contains no secrets, and data is protected by the database rules. A private repo with Pages needs GitHub Pro.

### Run on your own computer (optional)
```bash
cp .env.example .env.local   # fill in the two values
npm install
npm run dev                  # http://localhost:5173
```

---

## First steps in the app
1. Go to **Squads** and add your age groups with their **monthly fee**.
2. Go to **Settings** and add the club bank details (shown to parents) and invite coaches by Google email.
3. Go to **Players** and add players, then each player's parent/guardian (email, phone, address, consent tick). For siblings, use *Link an existing guardian*.
4. Go to **Sessions → Weekly series** to create the term's training dates, skipping holidays.
5. Coaches open **Registers**, pick today's session, tap each player's status and **Save**.
6. At the start of each month, go to **Payments** and press **Raise charges**.
7. When transfers arrive, go to **Payments**, find the family and click **Mark paid**.

## Testing-phase notes
- **Free Supabase projects pause** after about a week with no activity. Restore with one click in the dashboard.
- The free plan has **no automatic backups**. Export key tables (Table editor → Export CSV), or upgrade to Pro before going live.
- Use **made-up test data** until you're happy with access rules.
- Already ran an older `schema.sql` before email/password was added? Also run `supabase/upgrade_002_email_password.sql` once.
- Set up before monthly fees were added? Run `supabase/upgrade_003_monthly_fees.sql` once, then check the squad fees.
- **Data protection:** this stores children's data. Record consent (there's a tick box on each guardian), give parents a short privacy notice, and check whether the club needs to pay the ICO data protection fee.

## Files
```
supabase/schema.sql          tables, monthly charges, report views, security rules
supabase/seed_test_data.sql  made-up data for testing
supabase/upgrade_002_*.sql   upgrade for databases set up before email/password sign-in
src/pages/Login.jsx          sign in (Google or email), create account, forgot/reset password
src/pages/coach/             Registers list, attendance marking
src/pages/admin/             Players, Sessions, Payments, Reports, Squads, Settings
src/pages/parent/            My children (attendance, balance, how to pay)
test/                        database security tests (run against local Postgres)
.github/workflows/deploy.yml GitHub Pages deployment
```
