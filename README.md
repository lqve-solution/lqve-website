# lqve-website
Official website for LQVE Solutions

## Contact Form Setup (Cloudflare)
The contact form posts to `/api/contact` and uses:
- Cloudflare Worker
- Cloudflare Email Routing (delivery)
- Cloudflare Turnstile (anti-spam)
- Optional KV rate limiting (per IP)

### 1) Email Routing
1. Open Cloudflare dashboard -> domain `lqve.solutions`.
2. Go to `Email` -> `Email Routing`.
3. Add/verify destination mailbox `lqvesolutions@gmail.com`.
4. In `Routing Rules`, keep these active:
   - `business@lqve.solutions` -> `lqvesolutions@gmail.com`
   - `no-reply@lqve.solutions` -> `lqvesolutions@gmail.com`

### 2) Turnstile
1. Cloudflare dashboard -> `Turnstile` -> `Add site`.
2. Add hostname `lqve.solutions` (and `www.lqve.solutions` if used).
3. Copy:
   - Site key
   - Secret key
4. In `index.html`, replace the widget site key in:
   - `data-sitekey="1x00000000000000000000AA"`
5. In terminal, set secret for Worker:
```bash
wrangler secret put TURNSTILE_SECRET
```
Paste the Turnstile secret when prompted.

### 3) Optional Rate Limiting (recommended)
1. Create KV namespace:
```bash
wrangler kv namespace create RATE_LIMIT
```
2. Copy the returned namespace ID.
3. In `wrangler.toml`, uncomment and fill:
```toml
[[kv_namespaces]]
binding = "RATE_LIMIT"
id = "YOUR_NAMESPACE_ID"
```

### 4) Deploy Worker
```bash
wrangler deploy
```

### 5) Worker Route
Cloudflare -> `Workers & Pages` -> `lqve-website-contact` -> `Settings` -> `Triggers`:
- `lqve.solutions/api/contact*`
- `www.lqve.solutions/api/contact*` (if using `www`)

### 6) Test
1. Submit form from website.
2. You should receive email in `lqvesolutions@gmail.com` within seconds.

## Deliverability (DNS)
In Cloudflare DNS for `lqve.solutions`, add:
- SPF TXT on `@`: `v=spf1 include:_spf.mx.cloudflare.net ~all`
- DMARC TXT on `_dmarc`: `v=DMARC1; p=none; rua=mailto:business@lqve.solutions`
- DKIM: enable Cloudflare Email Routing DKIM records if prompted in Email settings.
