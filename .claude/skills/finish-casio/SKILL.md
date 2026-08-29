---
name: finish-casio
description: Finish a scope of the Casio Vault catalogue — take a series, a line, a year or a single reference, work out every reference that exists in it from BOTH rosters, and either catalogue each one or record a named reason why it cannot be. Use when the user says "/finish-casio ...", "finish series X", "fully finish X", or asks whether a series or line is complete.
---

# Finishing a scope

`/casio-catalog add` seeds what a crawl offers. This finishes a scope, which is a
different and harder question: **what exists here, and is every one of those
things either catalogued or refused for a reason somebody wrote down?**

The two are not the same, and the gap between them is not small. Asked to finish
`vintage:a159` — five references catalogued today — the crawler offered three.
Eight exist. The other five were each invisible for a **different reason**, and
the reasons imply different work:

| | |
|---|---|
| `A159W-N1`, `A159WA-N1` | Real. In Casio's own sitemap. `CANONICAL_REF` refuses their `-N1` variant block, so no crawl will ever see them |
| `A159WE-1`, `A159WEVJ-2`, `A159WEVJ-7` | Real. In Casio's own sitemap. **No archived product page anywhere**, so nothing states a specification and they must not be written |

Two of those were work. Three were the end of the work. A run that reports "3
references, done" and a run that reports "8 references, 5 catalogued, 3 with no
source that exists" are both finished — but only the second one is true, and only
the second one tells the next person not to look again.

**Read `../casio-catalog/SKILL.md` first.** Every rule there still binds: the
nine rules, D27's absent-means-unknown, D41's image credit, D2's permanent id.
This skill adds a survey and one tool; it relaxes nothing.

## The survey comes first, always

```
node references/survey.ts <scope> [--deep]
```

It reads **both rosters** — the archive's CDX index and casio.com's own current
sitemap — takes their union, and puts every reference in exactly one state.
Nothing is fetched from a product page and nothing is written. Run it, read it,
and only then decide what the work is.

Reading one roster is the mistake this skill exists to stop. The archive index
knows what Casio *published a page for*; the sitemap knows what Casio *sells
now*. A reference can easily be in one and not the other, and both directions
happen inside a single series: `A159WAD-1` has an archived page and is gone from
the sitemap; `A159WEVJ-2` is in the sitemap and was never captured.

### The six states

| state | what it means | what to do |
|---|---|---|
| `CATALOGUED` | already in a `catalog-src` YAML | nothing, unless the row names a gap |
| `SEEDABLE` | an archived product page exists | `seed-into.ts` — the crawler finds these itself |
| `REFUSED-D47` | Casio's sitemap lists it; `CANONICAL_REF` will not admit it | `seed-refs.ts` — name it by hand |
| `NO-PAGE` | in the sitemap, no archived page anywhere | **nothing.** Report it and stop |
| `FOREIGN-LINE` | the rest of the archive files it under another line | nothing. D2 makes a mis-filed id permanent |
| `NOT-A-REFERENCE` | refused by shape, and not in Casio's roster either | nothing. This is the filter working |

`SEEDABLE` and `REFUSED-D47` are the only two states that mean work.

### The seventh state the survey cannot print: NOT IN EITHER ROSTER

A series the survey answers with **"No references. Both rosters were asked"** is
not a finished scope and it is not `NOT-A-REFERENCE`. It is the survey saying it
has nothing to say. Both rosters it asks are *web* rosters — the archive holds
what casio.com published a page for, and the sitemap holds what casio.com sells
now — so a Casio that predates casio.com is invisible to both **by
construction**. That is the normal condition for anything before about 1998, not
a finding.

**Go to the Digital Watch Library. It is the third roster and it is not
optional.** On 2026-08-29 a 57-series scope reported 36 series as "in neither
roster" and stopped; walking DWL found **14 of them**, 13 with a photograph, a
module, a year and a case — full entries, from one page each. The report was
true and the stopping point was wrong, which is the more dangerous combination
because nothing in it looks like an error.

Write it as `NOT-IN-EITHER-ROSTER → DWL` in the report, never as "could not
find". The reader of a work list needs to know which of the three rosters were
actually asked; "not found" tells them nothing and invites the same walk again.
Only after DWL has been walked **and** the canonical slug forms probed with a
control may a reference be called unsourceable — and even then say "not in any
of the three rosters", which is a statement about the rosters rather than about
the watch.

### The definition of done, and the photograph is half of it

A scope is **finished** when both of these are true, not one:

1. **Every reference is catalogued or refused by name.** No `SEEDABLE` and no
   `REFUSED-D47` left, and everything not catalogued has a written reason.
2. **Every catalogued entry has a photograph, or a written refusal of one.**

**The second is not a lesser clause, and this is the part that gets skipped.** A
visitor sees the picture before they read a single field: it is how they know
they are looking at the right watch, and it is the whole difference between a
catalogue and a spreadsheet. An entry with seventeen specification rows and no
image is half an entry. The typographic tile the site renders instead is a
designed primary state rather than a broken one — which is exactly why it is so
easy to leave there and call the series done.

So treat a missing picture the way you treat a missing `case` or `module`: as an
unanswered question about the watch, not as styling. `survey.ts` enforces this —
a catalogued entry with no `image` reports **`NO PICTURE — nobody has looked`**
and the scope does not read FINISHED.

**`image: null` is the other half of the rule and it is not a loophole.** It
means somebody looked, refused what they found, and wrote down why — the same
named refusal this skill asks for everywhere else. That closes the scope. What
does not close it is silence. The three honest reasons to write `image: null`,
all of them already in this catalogue:

- nothing usable exists — a wrist shot, a lifestyle photo or a listing collage
  is not a product shot,
- the only candidate is under 300 px, which renders softer than the tile it
  would replace and is a downgrade rather than an improvement,
- **you could not prove it is the right watch.** The filename test is the one
  that works: `Casio-F-91W-1-Black.png` is F-91W-1 and `Casio-F-91WM-1B.png` is
  not. Where the source names its files `50016.jpg`, the page's own lead image is
  the best evidence available and is still not proof — look at it, and prefer a
  dial that prints the model name.

Ten of the sixty-one Vintage references sit at `image: null` on purpose. That is
a finished scope. Ten with the key absent would not be.

And the order matters: **write `image:` only after `npm run catalog:images` has
published the `.webp`**, never off the download. See the loop below.

### Scope shapes

```
node references/survey.ts vintage:a159      one series
node references/survey.ts a159              one series, line inferred from catalog-src
node references/survey.ts vintage           every series in the line, ranked by work left
node references/survey.ts A159WA-N1         one reference
node references/survey.ts 1991              a year
```

**A line scope is a work list, not a job.** It prints every unfinished series
ranked by how many references imply work; finish them one at a time, one commit
each (rule 9). Do not try to hold a line in one run — the Vintage campaign that
did 26 series took 63 minutes of crawling and that was with `pipeline.ts`
overlapping two hosts.

**A line scope is a work list for ARCHIVED series, and it is not a census.**
`survey.ts:454-457` only admits a sitemap-roster series into the line's table if
that line **already has a catalogue entry for it**. So a series that is real, in
Casio's current sitemap, and completely uncatalogued never appears in the line
survey at all — and its absence from the table is indistinguishable from being
finished. Measured 2026-08-29: `mtp-b195` (7 refs), `mtp-e740` (5), `w-221` (3),
`efk-110` (3) and `gw-bx5600` (3) were all missing from their line surveys while
being uncatalogued and real; a per-series run closed each one.

So a line scope alone can never say a line is finished. Take the sitemap roster
separately — `node ../casio-catalog/references/sitemap.ts <segment>` prints every
series it holds — and run the per-series survey on anything the line table did
not mention. Segments are `SEGMENTS` in `archive.ts`; `vintage` covers the
general `casio` roster and is the broadest single ask.

**A year scope is a question about sources, and there are two routes, not one.**
This paragraph used to say a `year` comes only from a dated Casio news release,
which is false against the project's own data and sent two year scopes away
believing nothing before 2024 could ever be sourced:

| route | how it looks | reach |
|---|---|---|
| a dated news release (D54) | `year` **and** `year_source` citing it | `news.ts` reads `casio.com/intl/news/` for 2024–2026 only, so this route genuinely stops there — 32 of 88 years |
| the entry's own page | `year` alone, off the source the entry already cites | every Vintage year, 1983 onward, read off The Digital Watch Library — 56 of 88 years |

The second is not a shortcut: `schema.ts` sanctions it explicitly ("the Vintage
entries … are dated by the source they already cite"), and integrity check 6
forbids only the reverse — a `year_source` with no `year`, a citation for a fact
that is not there. So `/finish-casio 1991` **can** attribute a year to 1991, from
a page that states it. What it cannot do is invent one: D25 forbids inferring a
year from a module number, from a neighbouring reference, or from how a watch
looks, and the survey counts both routes from the catalogue so the numbers above
cannot drift wrong again.

**Before reporting a year as unsourceable, distinguish absence from a bad grep.**
Searching the news corpus for `1975` matched 31 of 32 releases — every hit an SVG
path coordinate (`13.29574.21213`) or an AEM container id (`container-e1975f25e3`).
Interleave a year you know is stated as a control, exactly as `--deep` does for
captures: `1974` returns 10 prose hits in 3 files, which is what a real one looks
like. And a year in prose is still not a date for a watch — of those three, one is
the Casiotron release and the others are Hello Kitty's 1974 debut and a racing
team founded in 1974.

## Proving `NO-PAGE`, which is the only state that ends work without doing any

By default `NO-PAGE` means *not in the cached per-segment index* — 29 locales of
one segment. That is a weaker claim than it sounds, and it is not enough to tell
somebody a watch cannot be sourced.

```
node references/survey.ts vintage:a159 --deep
```

`--deep` runs **one domain-wide CDX query** over `casio.com` filtered to the
series prefix: every host, every path, every locale the archive holds. On A159 it
returned 45 captures across five references and found `africa-fr` and `at` pages
the segment cache does not hold — and zero, across all of them, for the three.
That is the measurement entitled to say no archived page exists.

**A filter that asks nothing answers `[]`, and `[]` is valid JSON.** Until
2026-08-24 this query stripped the hyphen out of the series id — it asked for
`product.AE1600` when every real URL says `product.AE-1600H-1AV`. Nothing
matched, the archive returned **200 with an empty list**, the cooldown guard
below had no HTML to catch, and every reference was stamped *proven: zero 200s
in a domain-wide CDX query*. That is the worst failure this tool can have: a
question nobody asked, recorded as a permanent claim that a watch cannot be
sourced. It hit every hyphenated series id, which is nearly all of them; `a159`
and `a168` looked healthy only because theirs have none. Fixed in `survey.ts`,
and the habit that catches the next one of these is below — **interleave a
control**, and check the cached `cdx-deep-<series>.json` is not three bytes.

**It distinguishes "no captures" from "did not answer", and so must you.** The
archive's per-IP cooldown answers **HTTP 200 with an HTML error page**, which
`JSON.parse` rejects and a careless reader would record as an empty result. A
rate limit reported as absence becomes a permanent claim about a watch. The
script refuses rather than returning zero; if it says the query did not answer,
the state is `UNPROVEN` and you say so.

### Before calling a reference unsourceable, exhaust these in order

1. **The archived product page (D52)** — `--deep`, per above. The best route
   wherever it exists: it states `case`, `water_resistance_m` and `colorway`
   about the *reference*, and it names the photograph.
2. **A module manual (D44)** — only if some page states the module. Never guess
   a module from a neighbouring reference; a module is a field like any other.
   **A 404 from `manual.ts` is not evidence until a control 404s differently.**
   On 2026-08-24 modules 1284 and 18 both returned HTTP 404 — and so did 593,
   the F-91W's module, which is certainly documented. Three 404s in a row look
   like proof and were the route being closed to everyone. Ask for a module you
   know is published before concluding anything about one you do not.
3. **The Digital Watch Library** — `kind: community`. The route is written out
   in full below, because guessing at it produces valid-looking wrong answers.
4. **casio.com live** — it answers **403** to everything that is not a person,
   full browser headers included. The AEM path underneath returns 200 and a
   location picker, which is a 200 that means no.

**Interleave a control, in the same run, at the same pace.** The Digital Watch
Library returned HTTP 500 for every A159 slug — and also for `casio-a158`, which
made the 500 look like a rate limit and the conclusion look unsafe. One run
alternating the targets with `casio-a168` settled it: `casio-a168` answered 200
three times out of three while every A159 slug hung. The hang *is* the absence.
Without the interleaved control that was a coin flip, and `sources.md` records
five sessions lost to re-walking walls for exactly this reason.

**Never compare a measurement taken here against one taken there.** Two probes in
two runs are two experiments. Re-measure the same way twice.

## Walking the Digital Watch Library, which is the third roster

**Enumerate, never guess a slug.** The one route that paginates:

```
http://www.digital-watch.com/DWL/gallery/Casio/all/          page 1
http://www.digital-watch.com/DWL/gallery/Casio/all/P18       +18 per page
...                                                          last is P846
```

48 pages, **853 Casio entries**, each an anchor to `/DWL/1work/<slug>` with the
watch name in the `alt`. Re-derive the last offset from page one's own nav
rather than trusting a loop bound. 1.5 s between pages walks it with 0 failures.

**Three URLs that answer 200 and are not this one.** Every one of them was tried
on 2026-08-29 before the recorded route was checked, and each returned a
well-formed page that simply was not the index:

| asked | answered | reads as |
|---|---|---|
| `/DWL/brand/casio/page/2` | 200, page one again | "the library holds 12 Casios" |
| `/DWL/brand/casio/P18` | 200, **byte-identical to P0** | a dry page, so the walk stops |
| `/DWL/gallery/Casio/all/18` | 200, page one again | "18 Casios exist" |

The `P` is load-bearing and its absence is silent. A walk that ends with far
fewer entries than 853 has found a wrong URL, not a small library — **treat the
count as the assertion**: if it is not ~853, stop and fix the route before
concluding anything about any watch.

**The gallery lists watches, not pages, so absence from it is not absence of a
page.** `casio-al-180` is the cited source of a cataloged entry, answers 200,
and appears on none of the 48 pages. Use the gallery to enumerate and to rule
out *variants*; confirm a specific slug by fetching it. Probe `casio-<ref>`,
`casio_<ref>` and both with hyphens stripped before reporting a miss, and say
**"not at any canonical slug form"** rather than "does not exist".

**Reading a page: by div id, never by position.** Full mapping in
`dwl-page-field-mapping`. The short version, and the two that bite:

- `#case1` is the case; `#bracelet1` is **not**. Read in order the values come
  out `Resin, 475, NONE, N/A, [Resin], 1985` and the trailing `[Resin]` is the
  bracelet. On FS-12 the two agree so the bug is invisible; on S-15 the case is
  steel and the bracelet `[SS]`.
- `#makermodel` reads `CASIO | ARW-320- AKA [Alti Depth]` — **the AKA form
  leaves a trailing hyphen on the reference.** A title-match check that does not
  strip it rejects seven real pages in a row, which looks exactly like the site
  refusing you.

**Calibrate before trusting the extractor**: run it over `casio_fs-12` and
`casio_f-151` first — both are reviewed entries in this repo — and require it to
reproduce their catalogued `module`, `case` and `year` exactly. Note that
`casio_f-151` serves the **F-15** page: a 200 can serve a different watch
(`casio-fs-01` serves FS-10), so parse `<title>` and require the reference in it.

**The photograph is on the page**: `…/images/watchlibrary24/_large/<file>`. Where
the filename names the reference (`FS-12-A.jpg`, `fb501.jpg`) that is the proof.
Where it does not (`DSC_3751.JPG`, `951.jpg`, `1-676-3.jpg` — that last one
carries the *module*, which is corroboration and not identity), the page's lead
image is the best evidence available and is **still not proof: look at it**, and
say in the YAML that you did. `image_credit.author` is per page — read
`#photography`; most say "Photographs by DWL" but DW-340 says "courtesy of
fujitime-traveller" and FB-50 "courtesy of Casiophile". Still `rights-reserved`;
courtesy is not a licence (D41).

**Icons by their `alt`, not their filename**: `bell` "I have an alarm" → `alarm`,
`multiple` "I have multiple alarms" → `multi-alarm`, `run` "I have a chronograph"
→ `stopwatch`, `countdown` → `countdown-timer`, `dual` → `dual-time`,
`calculator` → `calculator`. `data` "I hold data" → `databank` **only where the
page corroborates it** (EDB-600 is filed under Databank and named DATA MEMORY
350; ARW-320 is a Sensor whose data store holds altimeter readings, and it was
refused there for the same reason it was refused on BM-600's barometer).
`light` is **always dropped** — the vocabulary has five specific light values and
no generic one. `RELEASED | UNKNOWN` is no `year`; a case of `Misc.` is no
material; a `water1` div echoing its own label is no depth.

## Naming a reference by hand

```
node references/seed-refs.ts <line> <series> --crawl <REF>...
node references/seed-refs.ts <line> <series> --dry   <REF>...
node references/seed-refs.ts <line> <series> --write <REF>...
```

For `REFUSED-D47` and nothing else. It drops **one** gate, `isReference`, and
adds a stricter one in its place: **every reference must be listed in Casio's own
current sitemap.** That is Casio stating the reference exists (D48) — a stronger
claim about identity than any shape rule, and one a typo cannot satisfy. There is
no `--force`, deliberately: under D2 an id is permanent, and this is the one file
that could quietly make a bad one.

It also refuses a reference whose series prefix is not the file's (check 4a) and
one the rest of the archive files under another line. Everything else is
`seed-into.ts`'s behaviour unchanged — fields off the one page named in `source`,
D50's four-row floor, D46's unreadable report, no `year`, no `discontinued`.

**Do not touch `roster.ts`.** D47 was already revised once by the client, on
2026-08-19, closing O13 — and the revised decision **names the real references it
knowingly refuses**, `A159WA-N1` and `MQ-24-7BLL` and 37 collaborations among
them, and says admitting that class "stays a separate decision". So the
specification already agrees these references are real. What it withholds is a
crawl's licence to admit their shape, because the looser rule that admits them
also admits the `GSHOCKGIFTBAG` Casio's sitemap lists beside its watches, and D2
makes a gift bag's id permanent.

That is why naming by hand is the right move rather than a workaround: 1 095
references hang on the pattern and two hang on the name. Read D47's consequence
column before proposing a regex change.

**The note it writes into the YAML is the deliverable, not a comment.** A
reviewer reading `git diff` finds a reference the project's own filter refuses,
and "the tool did it" is not an answer. The note names the filter, the roster
that overrules it, and the open question nobody has closed.

## The loop, once the survey says what the work is

Every step is idempotent and the page cache is the progress, so an interrupted
run resumes rather than restarts.

```
node references/seed-refs.ts <line> <series> --crawl <REF>...     # or seed-into.ts
node ../casio-catalog/references/photos.ts   <line> <line>-<series>
npm run catalog:images
node references/seed-refs.ts <line> <series> --write <REF>...    # AFTER images
node ../casio-catalog/references/availability.ts <line> --write   # D59
node ../casio-catalog/references/news.ts --dry                    # D54, usually nothing
npm run catalog:build && npm run catalog:validate
npm run ci:status                                                # D57
```

**None of the middle three lines are optional.** `photos.ts` and
`catalog:images` are where the second half of the definition of done gets met,
and a run that stops after `--write` has produced a finished-looking file that
shows the reader a tile. If a photograph cannot be had, that is `image: null`
with the reason written down — a deliberate line in the YAML, not an omission.

The block above used to list `--write` *before* `photos.ts`, contradicting the
paragraph under it. Follow the block as it now stands. `seed-refs.ts` will also
refuse to run at all until the series file exists, so a `REFUSED-D47` reference
in a brand-new series needs `seed-into.ts --write` to create the file first —
that ordering is not obvious and costs a full crawl to discover.

Order matters in two places. `--write` runs **after** `catalog:images`, because
its gate is the published `.webp` and not the download — `catalog:images` refuses
a source it cannot fit inside §10.3's budget and deletes what it half-wrote, so
writing `image:` off the download asserts a file that is not there. And
`availability.ts` runs **after** the entries exist, because it measures what is
in the catalogue.

Re-run the survey at the end. It is the check that the work closed, and it costs
nothing.

## Traps this skill was built out of

**A derived asset path answers 200 and serves the wrong watch.** The page for
`A159WA-N1` names a 500 px `_Seq1.jpg`, so its 2× is not really 2×, and it is
tempting to reach for the `A159WA-N1.png` that the DAM serves at 200 and
1 878 844 bytes. That file is **byte-identical to `A159W-N1.png`** — both sha256
`e0e6ee1e83c4571f`. Deriving the path publishes the other reference's photograph,
between two silver resin digitals no diff review would catch. `photos.ts` only
ever fetches a URL a page named. Do not help it.

**A discovery filter is not a claim about reality.** `CANONICAL_REF` decides what
a crawl may do unsupervised. Reading it as "this reference is fake" costs the
catalogue its two most recognisable A159s — and `CANONICAL_REF`'s own comment
already names `A159WA-N1` as a real reference it knowingly refuses. Read the
comment before trusting the regex.

**An entry that states nothing is worse than absence.** 0 of 2 812 models carry
no field at all. A `NO-PAGE` reference has official identity and no
specification, and writing it would claim `official` while saying nothing —
exactly what D46 refuses. It would also be the first of its kind, which is a
decision for the client and not a side effect of a seeding run.

**A well-formed answer to the wrong question looks exactly like an answer.**
`g-shock` is `gshock` on casio.com and `pro-trek` is `protrek`; a CDX query on
the wrong segment returns **200 with an empty list**. The survey echoes the scope
it resolved and, when the universe is empty, says which rosters it asked rather
than printing a zero.

**A field is measured or it is not written.** Never write `discontinued` by hand
(D59) and never write a `year` that no dated page states (D25, D54).

**Check your own notes before you crawl a site you have crawled before.** The
DWL walk on 2026-08-29 burned three wrong URLs — `/brand/casio/page/2`,
`/brand/casio/P18`, and the categorylisting — each returning a well-formed 200,
before the recorded route was read. The correct URL, the page count, the delay
and the last offset were all already written down. Two of those wrong answers
were **quantitatively plausible** (12 slugs, then 17) and neither looked like an
error; only knowing the expected count of ~853 exposed them. Where a route has a
known magnitude, assert it: a walk that returns an order of magnitude less has
found a different question, not a smaller answer.

## What to report

Report the survey table, then what changed, then — the most useful line —
**everything refused, by name and with the reason**. A refusal with a name is a
question the next person can answer. A count is not.

**Report the pictures as their own line, not folded into a field count.** How
many entries gained a photograph, how many still have none, and for each
`image: null` the reason it was refused. "5 references, 5 catalogued" is not a
finished report if two of them show a tile.

Say explicitly whether the scope is now **finished**, and if it is not, which
state the remainder is in. And if a `NO-PAGE` set is what stopped it, say that
somebody with a browser could still settle it: casio.com answers 403 here and
200 to a person.

**Never write "could not find", and never end a report at "in neither roster".**
Both are claims about the world made from a measurement of two web indexes, and
the watches in question are usually real — they are shared, photographed and
documented by collectors, and the Casio community knows them well. Say which
rosters were asked and what each answered:

> ✗ "36 series could not be found."
> ✓ "36 series are in neither the archive index nor Casio's sitemap. DWL holds
>    14 of them — catalogued below. The remaining 22 are not at any canonical
>    slug form either, with both controls answering 200 in the same run."

The difference is not politeness. The first sentence closes a question that is
still open and tells the next person nothing about where to look; the second is
a measurement, names the route already walked, and leaves the door open where it
should be. A reference absent from all three rosters is **still probably real** —
it means the sources this project can reach do not describe it, which is a fact
about the sources.
