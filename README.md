# Casio Vault

A website where a Casio owner browses the watch catalogue by line and series and
presses **Owned One**. Everything they press collects on a personal page they can
keep private or publish.

**Live at [casiovault.com](https://casiovault.com/)**

> This is an independent, non-commercial project, **not affiliated with or
> endorsed by Casio Computer Co., Ltd.** Product images and reference codes are
> the property of Casio Computer Co., Ltd. Any takedown request is honoured in
> full.

## How it is put together

The catalogue is **not a database**. It is a versioned `catalog.json` plus WebP
files committed to this repo, served as static assets. It is read-only reference
data that changes a few times a year and is identical for every visitor — that is
a build artefact. Serving it as files makes browsing free, cacheable at the edge,
reviewable in `git diff`, and available even when Supabase is asleep.

It is served as **two** files, which is §6.2's split and was triggered by the
catalogue passing 2 500 models. `catalog-index.json` is the lines, the families,
the series and their counts — 5 KB gzipped, no models — and it is what the front
door and the rail on every page read. `catalog.json` is the whole thing, 102 KB
gzipped, and it is loaded by the screens that show watches and by the search
field once you touch it. Both carry the same version digest, so an index and a
catalogue that disagree are visible rather than silent. Per-series files and a
slim search index are the other two legs of that split and are **not** built.

Supabase holds **only** identity and each user's own rows. There is therefore no
SQL join between a watch and a collection row: every "what do I own" screen is a
client-side join against the catalogue already in memory.

|           |                                                                       |
| --------- | --------------------------------------------------------------------- |
| Frontend  | React 19 · TypeScript · Vite · Ant Design 5, per route                |
| Catalogue | Static versioned `catalog-index.json` + `catalog.json` + WebP         |
| Backend   | Supabase — auth and the user's own rows, RLS on every table           |
| Auth      | Google at launch. Magic link is built but held behind one constant    |
| Hosting   | GitHub Pages at the root of `casiovault.com`, `404.html` SPA fallback |

## Ant Design is not in the first load

The shell — header, rail, drawer, footer — and the front door render as plain
elements over CSS custom properties. Every screen that shows watches still uses
Ant Design, wrapped in `ui/AntdRoot`, which is imported by that screen's own
lazily loaded chunk and never by the entry chunk.

This is a measurement, not a preference. Rendering the header with AntD meant
loading the theme runtime, computing a token set and generating stylesheets
before anything could be painted: on Lighthouse's mobile profile the entry chunk
was 232 KB gzipped and took 1 469 ms to evaluate, and nothing appeared on screen
until it had. Initial JavaScript is now 119 KB gzipped and the mobile performance
score went from 63 to 96.

Three rules follow from it, and breaking any of them silently puts AntD back:

- **Nothing in the entry graph may `import … from 'antd'`.** That graph is
  `main.tsx`, `App.tsx`, `router.tsx`, `ui/AppShell.tsx` and everything they
  reach eagerly. `router.tsx` reaches `AntdRoot` through a dynamic import for
  exactly this reason.
- **Colours in the shell come from `theme/palette.ts`**, which imports no AntD.
  `theme/tokens.ts` is the AntD theme and imports it. `palette.test.ts` proves
  the shell's written-down values still equal AntD's own tokens, so the two
  cannot drift.
- **Layout decisions are media queries, not `Grid.useBreakpoint()`.** §8.2's
  768 px lives in `ui/shell.css`. A layout that needs JavaScript to choose itself
  cannot be drawn before the JavaScript arrives — and note that `display: none`
  does **not** stop React mounting a subtree or its chunk from loading, which is
  how the search field briefly went back to pulling 190 KB onto the front door.

`@ant-design/v5-patch-for-react-19` is **mandatory** and is imported on the first
line of `src/ui/AntdRoot.tsx` — the earliest point that is still inside that
boundary. Ant Design 5's static `message` / `notification` / `Modal.confirm` APIs
still call the React 18 render API; without the patch they fail at runtime rather
than at build time.

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
npm run catalog:build      # validate, then emit both catalogue artefacts
npm run catalog:images     # normalise catalog-src/images/raw to 400/800 WebP
npm run catalog:audit      # report what is missing; changes nothing, fails nothing
```

The catalogue is maintained through the `/casio-catalog` skill in
`.claude/skills/`, which is why Claude Code is launched inside _this_ repo rather
than the notes vault to work on it.

**Node 22.18 or later.** The catalogue scripts are TypeScript run directly by
Node's native type stripping, so the build validates against the _same_ Zod
schema the browser parses with. There is exactly one definition of a model in
this repo and it is `src/catalog/schema.ts`.

## The catalogue

`catalog-src/` is the authored source: `lines.yaml` for the seven lines,
`editions.yaml` for the collaborations, then one YAML file per series in a folder
named after its line. `catalog:build` turns that into
`public/catalog/catalog.json` and the models-free `catalog-index.json` beside
it — build artefacts, **not** committed files. What gets committed and reviewed is
the YAML. The index is derived from the finished catalogue rather than assembled
in parallel with it, so the two cannot carry different versions of the same data.

## Series and editions are two different questions

A **series** is the reference prefix, and it is mechanical: every model has
exactly one, it never crosses a line, and it is a URL segment
(`/line/vintage/a168`). An **edition** is a named limited or collaboration
release, and it is none of those things — PAC-MAN is five references sitting in
five different series, and `A168WECK-7A` is a Café Kitsuné collaboration while
`A168WECM-5` is a rose-gold colourway. They differ by one letter, so nothing can
be inferred from a reference code. Every membership is read off a page, one
reference at a time, and lives on the model as `edition: <id>`.

Two rules follow, and both are the same rule the catalogue already applies
elsewhere:

- **An edition carries a `source`, where a family does not.** A family is a
  judgement about how a watch looks. An edition says two companies made
  something together, which is a claim about the world — so it needs a page
  stating it, exactly as a model does.
- **An edition nothing is in is not published**, the same sentence as the line
  rule and the family rule. It is declared in `editions.yaml`, warns on the
  build, and appears nowhere until a reference names it.

Where the edition's own page does not name a reference — Casio's PAC-MAN page
lists four and there is an earlier fifth — the model carries an `edition_source`
pointing at the page that does. That is `year_source` again: one entry citing two
pages is honest only when it says which said what.

Everything deciding whether the catalogue is _correct_ lives in `src/catalog/` as
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
- **Build every path from `import.meta.env.BASE_URL`.** The base is `/` now that
  the site has its own domain, so a hard-coded path happens to work — which is
  exactly why this rule needs writing down rather than noticing.
- **`catalog-index.json` is not a substring match for `catalog.json`.** Every
  fetch stub and service-worker rule matches on the filename, so a matcher
  written for one silently misses the other — and the symptom is not a failure,
  it is a rail that renders its loading skeleton forever. `catalogArtefactResponse`
  in `src/test/` is the one matcher; use it.
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
