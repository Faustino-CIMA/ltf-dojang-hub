# Demo environment

The live LTF Dojang Hub holds real clubs and members, including minors. A demo login must never use that database.

Run the demo as a **second app** on the same Coolify server. It has its own address, its own secret key, and its own **empty** Postgres database. The only people in it are fictional. Their email addresses end in `@example.lu`.

Do not point this second app at the production database. Do not copy the production database into it. Do not run `seed_demo_data` or `seed_demo_accounts` on the live app.

The seed commands refuse to start unless `DEMO_MODE=true`. They also refuse when the database already contains a club or a member that is not marked as demo data. `--force-demo` does not override a missing `DEMO_MODE`, and it still leaves non-demo rows alone. The commands are not part of container startup, so a redeploy does not rotate passwords.

## What you are creating

A copy of the same repository and branch the live app uses, deployed beside it:

- one new frontend
- one new backend (and the worker and beat that belong with it, if the live app has them)
- one new Postgres database that has never held federation data
- one demo web address, for example `app.demo.example.com`, with the API on `api.demo.example.com`

The fictional logins, after seeding, are:

| Username | What they see |
| --- | --- |
| `demo_ltf_admin` | Federation desk, all demo clubs |
| `demo_ltf_finance` | Federation finance desk |
| `demo_club_admin` | Demo Nordlicht Dojang |
| `demo_club_admin_moselle` | Demo Moselle Pavilion |
| `demo_club_admin_red_lion` | Demo Red Lion Club |
| `demo_club_admin_three_acorns` | Demo Three Acorns |
| `demo_club_admin_valley` | Demo Valley Poomsae |
| `demo_club_finance` | Nordlicht’s finance desk (this is a club admin; there is no separate club-finance role) |
| `demo_coach` | Nordlicht, as a verified coach |
| `demo_member` | Nordlicht, as a member |

Passwords are the ones you set in the environment variables below. If you leave a variable empty, the seed prints a random password **once** in the terminal. Store it in a password manager. Do not put it in git, in a screenshot, or in a chat.

## 1. Add the second app in Coolify

You can either duplicate what is already running, or start a new project. Both must use the **same Git repository and the same branch** as the live app, and then a **different** database and domain.

### Duplicate the existing resources

1. Open the Coolify project that runs the live app.
2. Duplicate the application (the Docker Compose resource, or each of frontend, backend, worker, and beat if they are separate). Name the copy so it is obviously the demo, for example `ltf-dojang-hub-demo`.
3. If duplicating also copied a database, treat that copy as throwaway until you have checked its connection. The next section creates the database you will actually use. A duplicated database volume can still contain a snapshot of real people. Do not start the demo against it.

### Or add a new project

1. In Coolify, create a new project, for example `LTF Dojang Hub demo`.
2. Add an application from the same GitHub repository and the same branch the live app deploys.
3. If the live app is a Docker Compose resource, use that same compose file. If it is separate applications, add the same set: frontend, backend, worker, and beat.

Leave the live application and its database untouched.

## 2. Create a new empty Postgres database

This is the step that keeps real members off the demo.

1. In the demo project, add a **new** PostgreSQL resource. Give it its own name, for example `ltf-demo-db`.
2. Choose a new database name, user, and password. Write them down for the environment variables below.
3. Do not reuse the production database name, user, password, or internal host.
4. Do not paste the live app’s `POSTGRES_HOST`, `POSTGRES_DB`, `POSTGRES_USER`, or `POSTGRES_PASSWORD` into the demo app.
5. Do not restore a production backup into this database.

In Docker Compose, `POSTGRES_HOST` inside the stack is the compose service `db`. Duplicating the whole compose resource already gives that service its own volume, as long as you do not change `POSTGRES_HOST` to the live database. If the database is a separate Coolify resource, set `POSTGRES_HOST` to **that new resource’s** internal host, not the live one.

Before the first seed, the database should have no clubs and no members. Migrations may create empty tables. That is fine.

## 3. Environment variables

Set these on the **demo** backend, worker, and beat. Set the public URL variables on the demo frontend as well. Do not change them on the live app.

Generate a new `DJANGO_SECRET_KEY` (a long random string). Do not copy the production secret.

| Variable | Demo value |
| --- | --- |
| `DEMO_MODE` | `true` |
| `DJANGO_SECRET_KEY` | a new random string, different from production |
| `DJANGO_DEBUG` | `false` |
| `POSTGRES_HOST` | the new demo database host |
| `POSTGRES_PORT` | `5432` (unless Coolify shows another port) |
| `POSTGRES_DB` | the new empty database name |
| `POSTGRES_USER` | the new database user |
| `POSTGRES_PASSWORD` | the new database password |
| `DJANGO_ALLOWED_HOSTS` | the demo API host, for example `api.demo.example.com` |
| `CSRF_TRUSTED_ORIGINS` | `https://app.demo.example.com,https://api.demo.example.com` |
| `CORS_ALLOWED_ORIGINS` | `https://app.demo.example.com` |
| `FRONTEND_BASE_URL` | `https://app.demo.example.com` |
| `STRIPE_CHECKOUT_SUCCESS_URL` | `https://app.demo.example.com/checkout/success?session_id={CHECKOUT_SESSION_ID}` |
| `STRIPE_CHECKOUT_CANCEL_URL` | `https://app.demo.example.com/checkout/cancel` |
| `NEXT_PUBLIC_API_URL` | `https://api.demo.example.com` |
| `DJANGO_SECURE_USE_X_FORWARDED_PROTO` | `True` |
| `DJANGO_SECURE_SSL_REDIRECT` | `True` |
| `DJANGO_SESSION_COOKIE_SECURE` | `True` |
| `DJANGO_CSRF_COOKIE_SECURE` | `True` |
| `DEMO_LTF_ADMIN_PASSWORD` | a password you choose |
| `DEMO_LTF_FINANCE_PASSWORD` | a password you choose |
| `DEMO_CLUB_ADMIN_PASSWORD` | a password you choose, for `demo_club_admin` |
| `DEMO_CLUB_ADMIN_<SLUG>_PASSWORD` | a password for each other club admin. `<SLUG>` is the username after `demo_club_admin_`, in capitals. For example `DEMO_CLUB_ADMIN_MOSELLE_PASSWORD` for `demo_club_admin_moselle`, and the same pattern for `RED_LION`, `THREE_ACORNS`, and `VALLEY`. |
| `DEMO_CLUB_FINANCE_PASSWORD` | a password you choose |
| `DEMO_COACH_PASSWORD` | a password you choose |
| `DEMO_MEMBER_PASSWORD` | a password you choose |

Use your real demo domain in place of `demo.example.com`. The frontend calls `NEXT_PUBLIC_API_URL`. When that URL is left as localhost and the site is opened on a host that starts with `app.`, the browser instead calls `api.` plus the rest of the domain. Setting `NEXT_PUBLIC_API_URL` explicitly avoids that guess.

`FRONTEND_BASE_URL` is `https`, with no trailing slash and no `/en` or `/lb`. The success and cancel URLs use that same origin and no locale segment. `{CHECKOUT_SESSION_ID}` stays as those characters, braces included. Stripe replaces the token. Do not percent-encode the braces. Do not copy the live app’s Stripe secret or webhook secret into the demo; use the demo account’s own values if card checkout should work there.

`DEMO_MODE=true` also shows a small “Demo environment, fictional data” badge in the header (English, French, German, and Luxembourgish), so the demo is not mistaken for the live app.

## 4. Domain

1. On the demo frontend, set the domain to the demo site, for example `https://app.demo.example.com`.
2. On the demo backend, set the domain to the demo API, for example `https://api.demo.example.com`.
3. Point DNS at Coolify the same way the live domains are pointed, for these new names only.
4. Wait until Coolify shows the certificates as ready.
5. Deploy the demo app. The backend runs migrations on startup. It does **not** seed demo data on startup.
6. On the **demo backend**, load the Luxembourg street register once:

```
python manage.py refresh_lu_addresses
```

Until that table is filled, address search falls back to the previous lookup. A monthly job also runs on the morning of the 6th. Run this on the demo backend only.

Open the demo site. It should be an empty federation desk, not the live clubs.

## 5. Seed the fictional data

1. In Coolify, open a terminal on the **demo backend** container. Check the service name before you type. It must be the demo backend, not the live one.
2. Confirm the database and the flag:

```
python -c "import os; print('DB=' + os.environ.get('POSTGRES_DB','')); print('DEMO_MODE=' + os.environ.get('DEMO_MODE',''))"
```

`DEMO_MODE` must be `true`. `DB` must be the new demo database name. If either is wrong, stop.

3. Load the fictional clubs, members, licenses, teams, sizes, invoices, events, and logins:

```
python manage.py seed_demo_data
```

The command is safe to run again. A second run updates the same demo rows instead of duplicating them. It prints `password: set from DEMO_…` when a variable is set, and it does not print that password. If a variable was empty, it prints a random password once, the first time that login is created.

`python manage.py seed_demo_accounts` only refreshes the six logins, and only after a demo club exists. `python manage.py seed_demo_accounts --with-data` does the same work as `seed_demo_data`.

Sign in on the demo domain with one of the usernames above. The header badge should read “Demo environment, fictional data”. You should see fictional clubs such as Demo Nordlicht Dojang, not the live clubs.

## 6. Reset the demo

Resetting deletes the fictional data and loads it again. Do this only on the demo database.

1. Open the demo backend terminal and run the same `DB` / `DEMO_MODE` check as in the seed section. Stop if it is not the demo database.
2. Wipe the demo rows:

```
python manage.py flush --no-input
```

`flush` empties the database the process is connected to. That is why the check in step 1 matters.

3. Seed again:

```
python manage.py seed_demo_data
```

Another way, if you prefer not to use `flush`: in Coolify, remove the demo Postgres resource and create a new empty one, point only the demo app at it, redeploy so migrations run, then run `seed_demo_data`. Do not delete the production database.

The live app does not need a restart for any of this.
