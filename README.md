# Casio Collection

A website where a Casio owner browses the watch catalogue by line and series and
presses **Owned One**. Everything they press collects on a personal page they can
keep private or publish.

**Live at [codewithelvin.com/casio-collection](https://codewithelvin.com/casio-collection/)**

> This is an independent, non-commercial project, **not affiliated with or
> endorsed by Casio Computer Co., Ltd.** Product images and reference codes are
> the property of Casio Computer Co., Ltd. Any takedown request is honoured in
> full.

## How it is put together

The catalogue is **not a database**. It is one versioned `catalog.json` plus WebP
files committed to this repo, served as static assets. It is read-only reference
data that changes a few times a year and is identical for every visitor — that is
a build artefact. Serving it as files makes browsing free, cacheable at the edge,
reviewable in `git diff`, and available even when Supabase is asleep.

Supabase holds **only** identity and each user's own rows. There is therefore no
SQL join between a watch and a collection row: every "what do I own" screen is a
client-side join against the catalogue already in memory.

| | |
|---|---|
| Frontend | React 19 · TypeScript · Vite · Ant Design 5 |
| Catalogue | One static versioned `catalog.json` + WebP in this repo |
| Backend | Supabase — auth and the user's own rows, RLS on every table |
| Auth | Google at launch. Magic link is built but held behind one constant |
| Hosting | GitHub Pages, base path `/casio-collection/`, `404.html` SPA fallback |

`@ant-design/v5-patch-for-react-19` is **mandatory** and is imported on the first
line of `src/main.tsx`. Ant Design 5's static `message` / `notification` /
`Modal.confirm` APIs still call the React 18 render API; without the patch they
fail at runtime rather than at build time.

## Commands

```bash
npm install
npm run dev          # dev server
npm run build        # typecheck, build, and copy index.html to 404.html
npm run test         # unit and component tests
npm run test:coverage
npm run lint
npm run typecheck
npm run budget       # initial JS against the 380 KB gzipped budget

npm run catalog:validate   # parse catalog-src and run every integrity check
npm run catalog:build      # validate, then emit public/catalog/catalog.json
npm run catalog:images     # normalise catalog-src/images/raw to 400/800 WebP
```

**Node 22.18 or later.** The catalogue scripts are TypeScript run directly by
Node's native type stripping, so the build validates against the *same* Zod
schema the browser parses with. There is exactly one definition of a model in
this repo and it is `src/catalog/schema.ts`.

## The catalogue

`catalog-src/` is the authored source: `lines.yaml` for the eight lines, then one
YAML file per series in a folder named after its line. `catalog:build` turns that
into a single versioned `public/catalog/catalog.json` — a build artefact, **not**
a committed file. What gets committed and reviewed is the YAML.

Everything deciding whether the catalogue is *correct* lives in `src/catalog/` as
pure functions under a 90% coverage floor; `scripts/catalog/` only reads files
and prints. Every integrity check fails the build, and every run prints a
coverage table showing what share of models carry each optional field — so the
60% threshold that decides whether a filter renders at all is a number somebody
reads rather than a silent gate.

Two rules worth knowing before editing any of it:

- **A reference that does not match its line's pattern is a warning, not an
  error.** Silence it with a `# ref-exception: <why>` comment on the entry. The
  exception is usually real, and a rule that blocks real data gets deleted.
- **`catalog-src/.published-ids.json` only ever grows.** An id that leaves the
  source without a tombstone fails the build, because nothing in the database
  can follow a rename.

## Rules that are easy to break by accident

- **A model id is permanent.** Nothing in the database references it, so
  permanence is the only integrity mechanism the system has. A withdrawn model
  becomes a tombstone carrying `replaced_by`, never a deletion.
- **Never invent catalogue data.** A model needs `id`, `ref`, `line`, `series`
  and a `source`. Everything else is optional, and absent means unknown. The
  source's kind — official, retailer or community — is shown to the reader.
- **Unknown renders as itself** — never a blank, a zero, an "N/A", or a broken
  image. Most collectors' watches are discontinued and off casio.com, so the
  typographic card is a normal state rather than a fallback.
- **A facet only renders where its data is dense** — 60% of the models in view,
  or it hides. A filter over a sparse field lies by omission.
- **Every table denies by default.** RLS is the only access control; the anon key
  is public and always was.
- **Build every path from `import.meta.env.BASE_URL`.** A hard-coded
  `/catalog/catalog.json` works in dev and 404s in production.
- **Tests are mandatory.** 90% line coverage on `src/catalog/`,
  `src/collection/` and `src/auth/pendingIntent.ts`, enforced in CI and never
  lowered. Every bug fix ships with a test that fails without it. `.only` and
  `.skip` fail the lint step.
- **The wordmark is never styled to resemble Casio's logotype.** That is the one
  line not crossed.

The binding specification and the decision log live in the author's notes vault,
not here. Where this README and that document disagree, that document wins.

---

Made by Claude for Casio Lovers
