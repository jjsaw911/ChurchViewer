# Deploying to the VM

**This is live.** https://churchviewer.com serves from
`instance-20260809-171829` (project `churchviewer-505015`, zone `us-central1-c`,
Debian 13, e2-medium) at the reserved static address **34.44.190.110**.

Everything below has been done once already. It's kept as the record of how the
box was built — and what to redo if it's ever rebuilt.

## Day-to-day

```sh
gcloud compute ssh instance-20260809-171829 \
  --project=churchviewer-505015 --zone=us-central1-c
sudo -u churchviewer /srv/churchviewer/deploy/deploy.sh
```

`deploy.sh` deploys the **`claude/new-churchviewer-repo-wkxvzr`** branch, not
`main` — `main` is still the original scaffold, and deploying it would roll the
site back to a skeleton. Fix the default in `deploy.sh` once the branches
converge.

## Creating a platform administrator

A platform admin is an account with no church attached — it sits above every
church rather than inside one. Two things have to line up:

1. The address is in `PLATFORM_ADMIN_EMAILS` in `/srv/churchviewer/.env.local`
   (that's what grants the power), followed by
   `sudo systemctl restart churchviewer`.
2. An account exists for it. `/register` on the site can't make one — it creates
   a church as part of signing up — so use the script:

```sh
cd /srv/churchviewer && sudo -u churchviewer npm run admin:create -- you@example.com
```

It prompts for a password without echoing it, refuses any address not already
on the allowlist, and creates the user with no membership rows at all. Add
`--reset` to set a new password on an account that already exists.

This is deliberately not a web route. A public "claim the admin account"
endpoint is a race — whoever guesses the address first wins — and requiring
shell access means whoever creates the account already holds the server.

## Still outstanding

- **The transcription worker is installed but disabled.** It exits on start
  unless `OPENAI_API_KEY` is set, by design. Add the key to
  `/srv/churchviewer/.env.local`, then
  `sudo systemctl enable --now churchviewer-worker`.
- **No wildcard DNS and no wildcard certificate.** Only `churchviewer.com`,
  `www`, and `citychurch` resolve and are covered by the cert. Every new church
  currently needs a hand-made A record, a name added to both `server_name` lines
  in the nginx config, and a re-run of certbot with the extra `-d`.
- **`GCS_BUCKET` and the Google OAuth pair are blank.** The app degrades
  deliberately: the admin UI takes pasted media links only, and the Google
  sign-in button stays hidden.

## How it was built

Each step is checkable from your laptop, so don't move on until the check passes.

### 1. Firewall

A default VPC allows SSH and nothing else, so ports 80 and 443 silently drop
packets until you open them:

```sh
gcloud compute firewall-rules create allow-http-https \
  --allow=tcp:80,tcp:443 --direction=INGRESS \
  --network=default --source-ranges=0.0.0.0/0
```

**Check:** `nc -vz 34.44.190.110 80`. A *timeout* means still firewalled; a
*connection refused* means the firewall opened and nginx simply isn't up yet.
Refused is progress.

### 2. Static IP and DNS

The VM's address started out **ephemeral**, which means it would have changed on
the next stop/start and quietly broken every DNS record pointing at it. Promoted
to a reservation, in place, with no downtime:

```sh
gcloud compute addresses create churchviewer-ip \
  --project=churchviewer-505015 --region=us-central1 --addresses=34.44.190.110
```

Records at Namecheap (`dns1.registrar-servers.com`):

| Host | Type | Value | Status |
| --- | --- | --- | --- |
| `@` | A | 34.44.190.110 | live |
| `www` | A | 34.44.190.110 | live |
| `citychurch` | A | 34.44.190.110 | live |
| `*` | A | 34.44.190.110 | **not set** |

The wildcard is what would give a church a working address the moment it
registers. Without it, only the subdomains created by hand resolve, and the
registration flow hands every other new church a dead URL.

**Check:** `dig +short anything-at-all.churchviewer.com` returns the IP.
Currently it returns nothing.

### 3. App user and checkout

```sh
sudo adduser --system --group --home /srv/churchviewer churchviewer
sudo -u churchviewer git clone https://github.com/jjsaw911/churchviewer.git /srv/churchviewer
sudo -u churchviewer cp /srv/churchviewer/.env.example /srv/churchviewer/.env.local
sudo chmod 600 /srv/churchviewer/.env.local
```

Then edit `.env.local` — at minimum `DATABASE_URL` and
`NEXT_PUBLIC_ROOT_DOMAIN=churchviewer.com`.

### 3b. ffmpeg

The worker shells out to `ffmpeg` to take the audio track off a video a church
has uploaded. Without it that step fails with a message saying so, and nothing
else is affected.

```sh
sudo apt install ffmpeg
```

### 4. Postgres

A local PostgreSQL 17 cluster on the VM (not Cloud SQL), with its own role:

```sh
sudo -u postgres psql -c "CREATE ROLE churchviewer LOGIN PASSWORD '...'"
sudo -u postgres createdb -O churchviewer churchviewer
```

The password is in `/srv/churchviewer/.env.local` (mode 600, owned by
`churchviewer`) and nowhere else. `npm run db:migrate` created all nine tables.

### 5. TLS

**What was done:** a normal HTTP-01 certificate covering the three names that
actually resolve. Certbot installed its own renewal timer, and
`certbot renew --dry-run` passes.

```sh
sudo certbot certonly --webroot -w /var/www/certbot \
  -d churchviewer.com -d www.churchviewer.com -d citychurch.churchviewer.com \
  --email joseph.sawyer@outlook.com --agree-tos --no-eff-email --non-interactive
```

Note this registers a Let's Encrypt account and accepts their subscriber
agreement under that email address.

**The wildcard version, when you want it.** Let's Encrypt issues wildcards over
the DNS-01 challenge only — the webroot method cannot prove control of `*`. The
zone lives at Namecheap, not Cloud DNS, so there's no first-party plugin:

```sh
sudo certbot certonly --manual --preferred-challenges=dns \
  -d churchviewer.com -d '*.churchviewer.com'
```

`--manual` means no unattended renewal — you'd be re-running it by hand every 90
days. Moving the zone to Cloud DNS and using `--dns-google` is the version that
renews itself, and is worth doing before opening registration publicly.

### 6. nginx

```sh
sudo cp deploy/nginx/churchviewer.conf /etc/nginx/sites-available/churchviewer
sudo ln -s /etc/nginx/sites-available/churchviewer /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx
```

### 7. Services

```sh
sudo cp deploy/systemd/churchviewer*.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now churchviewer
# The worker stays disabled until OPENAI_API_KEY is in .env.local — see above.
```

The app binds `127.0.0.1:3000`, so it stays off the public interface no matter
what the firewall does. nginx is the only thing listening publicly.

### 8. Deploys from here on

```sh
sudo -u churchviewer /srv/churchviewer/deploy/deploy.sh
```

## Two things that will bite

**Session cookies are Secure-only in production.** `usesHttps()` in
[src/lib/env.ts](../src/lib/env.ts) returns true for any root domain that isn't
obviously local, and that flag goes straight onto the session cookie. Serve
`churchviewer.com` over plain http and sign-in appears to succeed but the
browser drops the cookie — you land back on the login page with no error. If you
want to test over http before TLS is issued, set `NEXT_PUBLIC_ROOT_SCHEME=http`
in `.env.local`, and remember to remove it afterwards.

**`NEXT_PUBLIC_ROOT_DOMAIN` is inlined at build time.** Editing `.env.local`
does nothing to a build that already happened. Rebuild after changing it.

## A subdomain that 404s

DNS resolving is only half of it — the slug also has to exist in the database.
`citychurch.churchviewer.com` reaches `/s/citychurch` through
[src/proxy.ts](../src/proxy.ts), and the layout calls `getChurchBySlug` and
`notFound()`s when there's no row. Register the church through the site, or seed
it, before expecting a page.

This is exactly why `citychurch.churchviewer.com` currently 404s: the record
resolves, the cert covers it, nginx routes it, the app maps it to
`/s/citychurch` — there's just no church row yet. Registering at
https://churchviewer.com/register with the slug `citychurch` creates it.
