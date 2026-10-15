# Cloudflare presentation deployment

The `neolaw-design` Worker serves the NeoLaw presentation app, including the twelve contract cards, NDA questions, cinematic reveal, typing flow, legal-basis response and reviewed Word example. Conversations and project changes remain in the visitor's browser.

## Cloudflare Workers Builds

- Repository: `marinosialita/neolaw-design`
- Production branch: `main`
- Root directory: `/`
- Build command: leave empty (Wrangler runs the configured build)
- Deploy command: `npx wrangler deploy`

Cloudflare installs the pinned npm dependency from `package-lock.json`. Wrangler runs `npm run build`, which copies only the public frontend files into `dist/`, then deploys the Worker and its static assets together.

## Local deployment verification

```sh
npm ci
npm run check:deployment
npm run check:contracts
npx wrangler deploy --dry-run
npm run dev
```

## Local backend

The live screening, research-provider connections, follow-up screening chat and generated screening PDFs use the loopback-only Python server described in README.md. They are not hosted by this presentation deployment. Hosted `/api/*` requests return an explicit JSON explanation with HTTP 503. The Worker does not forward requests or provider keys to another server. Hosting those services requires a separate authenticated backend.

Local source caches, virtual environments, credentials, work files and screenshots are excluded from Git. They are also excluded from the generated public asset directory. The supplied NDA is a fixed presentation example; answers do not change its text.
