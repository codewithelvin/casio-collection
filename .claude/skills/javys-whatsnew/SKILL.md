---
name: javys-whatsnew
description: Check javys.com's "What's New" feed for this year's newly released Casio watches and catalogue whichever ones this catalogue does not have yet. Use when the user says "/javys-whatsnew", asks to check for new watches this year, or asks to keep the vintage line up to date with Casio's latest releases.
---

# javys What's New

`https://www.javys.com/casio/whatsnew.htm` is Javys's own log of series it has
just added — Standard Analog, Standard Digital, Digital-Analog and Beside are
the only four subbrands it has ever carried there, and all four map to this
catalogue's `vintage` line (see `../casio-catalog/references/sources.md` and
this catalogue's own javys-sourced vintage files). This skill reads that page,
works out which references on it are new **this year**, and adds whichever of
those this catalogue does not already have — minimal entries, the same policy
already used for `catalog-src/vintage/w-69.yaml` and the rest of this
session's javys backfill: `id`, `ref`, `source`, and `image`/`image_credit`
where a usable photograph was found. Nothing else, until somebody reads the
page in full and writes a proper series file (`/casio-catalog add`).

**This is upkeep, not sourcing.** It exists so a line that was fully caught up
against javys does not silently fall behind every time Casio ships something
new — it is not a substitute for `/casio-catalog add` or `/finish-casio`, and
it never touches a series file that already has a hand-reviewed entry in it
(the append-only rule below is what protects that).

## Why year-scoped, and why that is exact rather than a guess

Every series link on the page reads `series.php?series_id=<PREFIX><YY><SEQ>` —
`DA2601` is Digital-Analog's first 2026 release, `SD2512` is Standard
Digital's twelfth 2025 one. The `YY` right after the two-letter subbrand code
**is** the year, so filtering to "this year" is a fact read off the id, not a
heuristic over a date the page never states.

**The live page is not itself year-scoped.** Measured 2026-09-09: `whatsnew.htm`
still carried every 2025 entry beneath the 2026 ones — Javys appears to archive
it to `whatsnew<YYYY>.htm` at some point after the year turns, but during the
year the current page accumulates the whole year and the tail of the one
before it. This is why the year filter is load-bearing rather than a nicety:
running this without it would re-offer a year's worth of references the
catalogue may already have caught some other way.

## Running it

```
node references/whatsnew.ts --dry              # what would be added, this year
node references/whatsnew.ts --write             # crawl, download images, write the YAML
node references/whatsnew.ts --dry --year 2025   # a past year, e.g. to check nothing was missed
```

Always run `--dry` first and read it. It costs one request (the feed page
itself) plus one per candidate series — no detail-page fetches, no images —
and it tells you exactly which references would be added and to which series
file, before anything is written.

`--write` does the rest of the pipeline: for each new reference, fetches its
detail page (`new_web/watch/new_watch.php?id=<REF>`) for the citation URL and
its large `_L` photo where one exists (routine for a brand-new reference,
unlike the older javys backfill where it was the exception), falls back to the
series listing's own thumbnail otherwise, downloads whatever image results,
and appends a minimal entry to `catalog-src/vintage/<series>.yaml` — creating
the file with a header if the series is new, appending to it unmodified if it
already exists. It never rewrites or reorders an existing entry.

Then, same as every javys run this session:

```
npm run catalog:images && npm run catalog:build
```

`catalog:images` normalises whatever was downloaded to 400/800 px WebP inside
§10.3's budget; `catalog:build` is the gate — read its NFR-4 budget line
before committing, though a handful of new references costs single-digit
kilobytes of headroom, not the whole budget.

## What it deliberately does not do

- **No specifications.** Display, movement, module, case, water resistance,
  features — none of it. Reading those off javys's own labels is
  `/casio-catalog`'s job (`seed.ts`, the manual reader), applied to a series
  once somebody decides it is worth doing properly. This skill's whole point
  is speed: catalogue the reference and its photograph the day it appears,
  worry about the spec table later.
- **No `year`.** Javys's pages state none, same as every other javys-sourced
  entry in this catalogue.
- **No GIF images.** `catalog:images`' `ACCEPTED` set does not include it, and
  this skill does not extend that — a GIF-only candidate is skipped and
  counted, not silently dropped. (Rare: it is a leftover from javys's older
  hand-coded pages, not the `series.php`/`new_watch.php` system this feed
  actually links to.)
- **No re-check of an already-catalogued reference.** The dedup is against
  **every** line's catalogue, not just vintage's — a javys subbrand tag has
  mistagged a reference into the wrong line before, and this is what stops
  the same reference from being filed twice under two lines.

## Caveats worth knowing before trusting a "nothing to do"

- **Only four subbrands, ever.** If Casio starts shipping something under a
  subbrand javys has never used for its What's New feed (it has never carried
  G-Shock, Baby-G, Edifice, Sheen, Oceanus or Pro Trek here — those lines have
  their own official-source pipelines in `/casio-catalog`), this script will
  not see it. It reads only what the page actually links.
- **A reference already added by a fuller crawl reads as "already
  catalogued", correctly** — this skill is meant to run *after* a full javys
  backfill has happened at least once, as the thing that keeps a caught-up
  line caught up, not as the first way to seed it.
- **Rate limit: ~3 requests/second**, matching every other javys crawl in this
  project. Do not raise it; javys's own broken-link rate (2–8% depending on
  the image's year folder) is normal and not a sign the crawl is misbehaving.

## When to stop and ask

Same as `/casio-catalog`'s list, because the same schema and the same nine
rules bind here:

- a reference whose shape does not match vintage's `ref_pattern` — the script
  reports and refuses it rather than writing a `# ref-exception`, which is a
  human decision;
- a series that already has hand-reviewed entries and this script's own append
  would sit oddly beside them (it will not overwrite anything, but say so in
  the report rather than let a reviewer discover it in `git diff`);
- javys itself changing shape — a different `series.php` template, a
  different `series_id` format — since every assumption above was measured
  against the page as it exists on 2026-09-09 and is not guaranteed to survive
  a redesign.
