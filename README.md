# lqve-website
Official website for LQVE Solutions

## Contact Form via Cloudflare Worker
This project includes a Cloudflare Worker endpoint at `/api/contact` that emails contact form submissions.

### 1. Enable Email Routing for `lqve.solutions`
- In Cloudflare Dashboard, open your domain.
- Go to `Email` -> `Email Routing`.
- Enable Email Routing and verify destination mailbox for `business@lqve.solutions`.
- Create sender address `no-reply@lqve.solutions` (or update `CONTACT_FROM` in `wrangler.toml`).

### 2. Deploy Worker
- Install Wrangler and authenticate:
```bash
npm i -g wrangler
wrangler login
```
- Deploy:
```bash
wrangler deploy
```

### 3. Route `/api/contact` to Worker
- In Cloudflare Dashboard -> `Workers & Pages` -> your worker -> `Settings` -> `Triggers`.
- Add route:
`lqve.solutions/api/contact`
- If you use `www`, add:
`www.lqve.solutions/api/contact`

### 4. Test
- Open the site and submit the contact form.
- You should receive an email at `business@lqve.solutions`.
