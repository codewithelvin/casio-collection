# Where this data actually lives

Not where you would expect. Read this before researching anything — every line
of it was learned by getting it wrong first.

## Read this first: the product page is not closed, it is only offline

Everything below about the 403 wall is still true of **live** casio.com. It stopped
being the end of the story on 2026-08-17.

**`web.archive.org` serves Casio's own product pages, at 200, in the original
markup.** The same AEM page that 403s live comes back with its Specifications
accordion server-rendered and its `/content/dam/` image URLs intact — and those
image URLs are **still served live by casio.com today, at 200**. So the archive
is a way of *retrieving* Casio's page, not a new source with its own authority
(D52), and §10.6's one-page rule binds harder here than anywhere: every field on
a model seeded this way, and its photograph, come from the one page in
`source.url`.

```
node .claude/skills/casio-catalog/references/archive.ts sheen              # what is archived
node .claude/skills/casio-catalog/references/archive.ts sheen SHE-4550D-7A # one page, read
node .claude/skills/casio-catalog/references/archive.ts oceanus --all      # the line, as JSON
```

What this changes: the product page states `case`, `water_resistance_m`,
`colorway` and the features **about the reference**, where a module guide can
only ever state them about the module (D25). And it does not need the module at
all, which is what had Sheen and Oceanus blocked.

Four things it will lie to you about if you let it:

- **This catalogue's line id is not casio.com's URL segment.** `g-shock` is
  `gshock` on casio.com, `baby-g` is `babyg`, `pro-trek` is `protrek`, and
  `vintage` lives under `casio/vintage`. Sheen and Oceanus match, which is the
  only reason `seed.ts` gets away with passing the line id straight through. A
  CDX query on the wrong segment answers **200 with an empty list**, so the first
  photograph backfill reported "0 archived product pages" for all 670 G-SHOCK
  references — a well-formed answer to the wrong question. Read the segments off
  Casio's own sitemap (`node sitemap.ts` prints them); never type them from
  memory. Note also that Casio files 31 G-SHOCKs under `gshock/lifestyle`, so a
  line can have more than one segment.
- **Size is not richness.** The reader keeps every capture of a reference and
  parses them in size order, because the biggest is often the newest template,
  which carries more chrome and fewer server-rendered rows. OCW-S400-2A's 53 KB
  capture states **one** specification; the 33 KB capture beside it states eleven.
- **There are two generations of the row markup, differing by one tag** — the
  label is an `<h4>` in the 2024 captures and a bare `<div>` in the 2022 ones. A
  reader written against either returns **zero rows** on the other. Not an error,
  not a short table: nothing, which reads exactly like a page that states no
  specifications. That single tag was worth 144 Sheen references.
- **The playback endpoint 503s under load**, often, and a script without backoff
  reports "not archived" for a page that is. Never cache a failure — an empty
  file written for a 503 is a permanent lie that survives the retry that would
  have fixed it.

D46 still applies: a capture whose accordion states nothing is reported and
skipped, not filled in from somewhere else.

## casio.com is open, and it is not the part you want

| Path | Answers |
| --- | --- |
| `casio.com/us/watches/...`, `/intl/`, `/jp/`, `gshock.casio.com` | **403** |
| `web.archive.org/web/<ts>id_/…/product.<REF>/` | **200**, with the specs and the image URLs |
| `casio.com/content/dam/casio/product-info/…/assets/<REF>[_Seq1].png` | **200** — the photograph, live |
| `casio.com/content/casio/locales/us/en/watches/casio/product.<REF>.html` | 200, and it is the **location picker** — no product content |
| `casio.com/content/dam/casio/global/support/manuals/watches/pdf/<NN>/<module>/qw<module>_EN.pdf` | **200** |
| `support.casio.com/<loc>/manual/manuallist.php?cid=004` | 403 — redirects into the walled site |
| `world.casio.com/support/manual/watches/` | 200, and it is only a locale picker |

The 403 is Akamai reading the user agent. **Send a browser user agent** —
`WebFetch` sends its own and gets the connection closed, which is how this was
once misread as "casio.com is unreachable". A browser agent does not rescue the
product pages: those are blocked by path, not by agent.

So the route to official data is the **operation guide** (D44), and §10.6 counts
a manual page as `official`. `references/manual.ts` fetches, decrypts and reads
one:

```
node .claude/skills/casio-catalog/references/manual.ts 5611 --specs
```

Two Casio brand hosts answer 200 on their **home page only** — `g-shock.eu` and
`casioindia.com`. Every deeper path 403s and the canonical URL points back at
`gshock.casio.com`. They are not a way in; do not spend an hour on them again.

## What a guide gives you, and what it never will

A Specifications block carries exactly the fields a filter is built from:
`display`, `movement`, `module`, and the functions. It states, in its own rows,
things like `Alarms: 5 daily alarms; Hourly time signal` and
`Power Supply: Solar panel and one rechargeable battery`.

It never carries:

- **`year`** — the guide dates the module, never the reference (D25).
- **`case`, `water_resistance_m`, `colorway`** — properties of the watch.
- **`shock-resistant`, `mud-resistant`** — what the watch is *sold* as. Writing
  it from a page that does not say it is the catalogue asserting something on
  Casio's behalf, which FR-10.4 rules out.
- **which references use the module.** That is the roster problem below.

### Read the words, not the family resemblance

Two guides that look alike are two watches. Module 3229's says
`Multi-function alarm` — one alarm with several setting modes — which is `alarm`.
Module 5611's says five, and gets `multi-alarm`. Module 3266's table is
near-identical to 3184's except that it has no `Time Calibration Signal
Reception` row, so one is `solar` and the other `solar-radio`. Module 3230's
guide has no Flash Alert section though 3229's does, on the same shape of watch.

### Some "manuals" are pictures

Older modules publish an **operation chart** — a scanned CCITTFax image whose
only machine-readable text is its own title, `OPERATION CHART:MODULE QW-1289`.
It states no specifications, so there is nothing to read a field off and the
references on that module cannot be seeded from it. `manual.ts` reports
`CHART (image only)`. Say so and move on; do not fill the gap from elsewhere and
leave the manual as the `source`.

Newer Bluetooth-era guides (5594, 5623, 5678) are readable text with **no
Specifications block at all**. Same answer.

## The roster problem

A guide says what module 3229 *does*. It does not say **which references use it**,
and without that there is no model to write.

**For G-SHOCK, ShockBase solves it.** Its module page says, in so many words,
"These are all watches with module 3229", which is provenance for a model's
**identity** — which watches exist and which module they are on. Every **field**
still comes from the guide, so a reader clicking `source` lands on the page every
fact on that entry was read from. That is what keeps this inside §10.6's
one-page rule instead of merging two sources into one entry. Record it in the
series file header; it looks like a shortcut to whoever arrives later.

`references/roster.ts` reads it:

```
node .claude/skills/casio-catalog/references/roster.ts modules 2100      # which modules the series uses
node .claude/skills/casio-catalog/references/roster.ts refs 5611 GM-2100 # the references on one
```

Two pages, not interchangeable: the **series** page (`series_dyn.php?series=`)
groups by subseries and names each group's module but lists only a *sample* —
its "(157 in total)" heading sits above sixteen entries. The **module** page
(`modules_dyn.php?module=`) has the whole roster. Nicknames have their own page,
`nicknames_dyn.php?nickname=Frogman`, which lists subseries with modules — the
only way to find the Frogmen, since "Frogman" is not a reference prefix.

### For every other line, the roster is Casio's own sitemap

**`casio.com/<locale>/sitemap.xml` answers 200.** The product *pages* 403 and the
AEM paths under `/content/casio/…` return the location picker, but the sitemap is
served — and the reference is in the path:

```
https://www.casio.com/us/watches/edifice/product.EFR-527D-1AV/
```

That makes the roster **official** for every line, which is better than G-SHOCK
has. Three locales are enough to cover what the others repeat — `us`, `intl` and
`de`; `eu` 404s and `jp`/`asia` list no products. Deduped, they hold:

| line | references |
| --- | --- |
| `casio` (Standard, includes Databank shapes) | 1955 |
| `gshock` | 1443 |
| `edifice` | 430 |
| `babyg` | 381 |
| `casio/vintage` | 195 |
| `sheen` | 160 |
| `protrek` | 97 |
| `oceanus` | 26 |

```
node .claude/skills/casio-catalog/references/sitemap.ts            # every line, counts
node .claude/skills/casio-catalog/references/sitemap.ts edifice    # its series, by size
node .claude/skills/casio-catalog/references/candidates.ts edifice:edifice
```

`candidates.ts` is the join that matters: Casio's roster against the series →
module table, ranked by how many references a series would bring in. A series
needs both — the sitemap states no specifications, so **the module guide is still
where every field comes from**, and `casiofanmag.com/getmanuals/<line>/` is the
only thing found that says which guide to open. That is a community source, used
exactly as ShockBase is: identity, never fields.

**Where the join is empty, the line used to stay empty.** Sheen and Oceanus have
186 references between them and almost no module for any of their series. Do not
fill the gap by deriving a module from a similar reference — and as of D52 you no
longer have to, because **those two lines do not need the join at all**. The
archived product page states the fields itself, so the module is one more thing
read off the page rather than the key that unlocks it. Everything below about
casiofanmag's decade gap is still accurate and is no longer a blocker.

**What "no module" actually means for those two, measured 2026-08-17.**
`getmanuals/sheen/` and `getmanuals/oceanus/` do not 404 — they **301** to
`casiofanmag.com/sheen/` and `/oceanus/`, which is why `seriesModules()` returns
an empty map rather than throwing. Those categories are not review articles
either: each holds one post per series whose `<title>` **names the module** —
`Casio Sheen SHE-3040 / 5456 / All Models`. Fifteen pairs are there for the
taking:

| | |
| --- | --- |
| Sheen | `she-3040` 5456 · `she-3046` 5483 · `she-3062` 5420 · `shs-4502` 5548 · `shs-4525` 5584 · `shs-d100` 5548 · `shs-d300` 5584 · `shw-1700` 5435 · `shw-5100` 5592 · `shw-5200` 5253 |
| Oceanus | `ocw-s340` 5496 · `ocw-s3400` 5453 · `ocw-s5000` 5603 · `ocw-t2600` 5347 · `ocw-t3000` 5583 |

**And they are almost all the wrong series.** casiofanmag documents what people
own; Casio's sitemap lists what Casio sells. Joined against the roster the
overlap is **0 of Sheen's 39 series and 1 of Oceanus's 5** — `ocw-s5000`, module
5603, six references. Everything else casiofanmag names is discontinued and gone
from the sitemap, and everything the sitemap lists (`she-45xx`, `ocw-s7000`) is
too new for casiofanmag.

So the honest statement is not "there is no module source" but **"the module
source and the roster describe different decades"**. Anything more than those six
references needs a source that names the module of a *current* Sheen or Oceanus,
which is what casio.com's own product page would say if it answered.

### The rest of what has been checked

| Source | Covers | Gives |
| --- | --- | --- |
| ShockBase | G-SHOCK only | references + module ✓ |
| WatchBase (`watchbase.com/casio/caliber/<module>`) | G-SHOCK-centric; no Edifice, Pro Trek, Oceanus, Sheen, Databank | some references |
| `casiofanmag.com/getmanuals/<line>/` | **every line** | **series → module, not reference → module** |
| `casiorestore.com` | 33 vintage models, none of A700 / AE-1200 / B640 / MQ-24 | full specs per model |
| `digital-watch.com` | vintage | **deep pages currently time out**; the home page answers |

So for Edifice, Pro Trek, Baby-G, Sheen, Oceanus and Databank the *module* is
obtainable and the *guide* is readable, and the missing piece is the list of
variant references. Do not invent them: a reference is a permanent id (D2), and
a made-up variant is the one error this catalogue cannot take back.

## Filtering a roster

ShockBase lists collaborations and nicknames beside references.
`DW-6900-Space-Invaders` is a nickname. `DW-5600MW-7INSA` is really DW-5600MW-7
with a collaborator's name appended, and `DW-5600-BAIT20-7` carries a doubled
hyphen no Casio document has. Those are sources disagreeing about the reference
itself, which the sourcing rules say means not writing the model at all.

`roster.ts` keeps the shape Casio prints — prefix, number, a variant of at most
four letters, one suffix of digits with at most one letter and one more digit:

```
/^[A-Z]{1,5}-?[A-Z]{0,2}\d{2,5}[A-Z]{0,4}-\d{1,2}[A-Z]?\d?$/
```

This is not invented. It is the filter the reviewed M2b commits used, recovered
by testing candidates against them, and it reproduces all three exactly:
DW-5600 122 of 199, GW-M5610 27 of 29, GA-2100 77 of 90 — nothing kept that was
not committed, nothing dropped that was. Keep it that way, so a human reviewing
a new series is reviewing the same judgement they already approved.

## Images

Wikimedia Commons answers a generic user agent **403**; send a browser agent.
It holds free photographs of a handful of the references in §10.4's list. Casio's
own product photography is `rights-reserved` under D11 — never guess a licence,
and never publish a file whose page does not name one (D41, check 5a).

**Commons photographs vintage Casios and does not photograph current G-SHOCK.**
Measured: 50 files for F-91W, and **zero** for GA-110, DW-6900, GM-2100,
GMA-S2100, the Frogmen and the Mudmasters. The one GA-2100 file is a *modified*
watch. That was O12, and it is closed by the archive rather than by Commons.

**The archived product page names the file, and casio.com serves it.** The page
carries absolute `/content/dam/casio/product-info/…/assets/<REF>_Seq1.png` URLs,
and those answer **200** live today with a browser agent. So D41's rule is met
the way D41 asks it to be met — the file is not derived from the reference, it is
**read off the page that publishes it**:

```
image_credit:
  author: Casio Computer Co., Ltd.
  licence: rights-reserved
  url: <the archived product page — the same URL as `source`>
```

`url` is the archived page rather than the live one for the same reason
`source.url` is: a credit that cannot be opened is decoration, and the live URL
403s.

Two traps in the URLs themselves:

- **Take the reference's own asset, not the first image on the page.** Every
  product page also carries `…/color-variation/…` URLs for the *other*
  references in the series. Publishing the first match would put a photograph of
  a different watch under this one's reference, and nothing would go red.
- **Matching the asset by prefix takes the wrong watch, and matching it exactly
  loses most of them.** Casio names the asset for `SHE-4539CM-4A` as
  `SHE-4539CM-4AU`, so an exact match drops **83 of Sheen's 141** photographs.
  But `GA-2100-1A` is a prefix of `GA-2100-1A1`, which is a different watch in
  this catalogue whose `color-variation` URL is on the same page — and there are
  assets named `SHE-4539CM-4A_SHE-4540CM-3A.jpg`, which are a picture of **two**
  watches. So the rule is: exact wins; otherwise the reference may be extended
  only by **one to three letters**, and only where that does not spell another
  known reference. A digit or an underscore means it is not this watch.
- **`.transform/<name>/image.png` is a rendition**, capped at whatever width that
  CSS breakpoint wanted. Take the untransformed asset; `catalog:images` does the
  resizing, and §10.3's budgets are enforced on the output.
- **Every locale publishes its own copy of the same asset, and they are not the
  same bytes.** `SHE-3048PGL-7B_Seq1.png` under `/locales/intl/`, `/sg/` and
  `/in/` has three different SHA-256s and two different byte lengths, and `de`,
  `europe` and `us` 404 for it entirely. So a photograph has to be fetched from
  the URL **its own credit page names** — which means the filename alone cannot
  decide whether a raw file is current. When `seed.ts` picks a different capture
  for a reference, the locale in the image URL moves with it. `photos.ts` keeps a
  `photos-<line>.json` manifest of what was fetched from where, and re-fetches on
  a mismatch rather than trusting that a file with the right name is the right
  file.

**Prefer an English capture even over a richer one.** Casio's `de` pages state
the same rows in German — `Gehäusegröße (L x B x H)`, `Wasserdichtigkeit`,
`Glas` — and every field reader matches on the English label. A German capture
therefore clears the row gate with six rows and yields an entry with **no fields
at all**, displacing a page that would have filled the table. `seed.ts` ranks
English first and falls back to German rather than dropping the reference, so a
reference captured only in German is still seeded, sparsely and honestly.
