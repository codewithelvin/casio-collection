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

`SEEDABLE` and `REFUSED-D47` are the only two states that mean work. A scope is
**finished** when neither is left and every catalogued entry's gaps are named.

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

**A year scope is mostly a question about sources, and the honest answer is
usually no.** A `year` is only ever written from a dated Casio news release
(D54), and `casio.com/intl/news/` indexes recent years only — `news.ts` reads
2024 to 2026. So `/finish-casio 1991` cannot attribute anything to 1991: it
lists the models that already carry that year, names the series they sit in, and
says plainly that no dated official source reaches back that far. That is a gap
in the source, not in the catalogue, and D25 forbids inventing the difference.
Do not offer to infer a year from a module number or from how a watch looks.

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
3. **A community source** — the Digital Watch Library, `kind: community`.
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

**Do not touch `roster.ts`.** Widening `CANONICAL_REF` is O13, it is the client's
decision, and D47 says so. The whole point of naming references by hand is that
it needs no decision: 1 095 references hang on the pattern and two hang on the
name.

**The note it writes into the YAML is the deliverable, not a comment.** A
reviewer reading `git diff` finds a reference the project's own filter refuses,
and "the tool did it" is not an answer. The note names the filter, the roster
that overrules it, and the open question nobody has closed.

## The loop, once the survey says what the work is

Every step is idempotent and the page cache is the progress, so an interrupted
run resumes rather than restarts.

```
node references/seed-refs.ts <line> <series> --crawl <REF>...     # or seed-into.ts
node references/seed-refs.ts <line> <series> --write <REF>...
node ../casio-catalog/references/photos.ts   <line> <line>-<series>
npm run catalog:images
node ../casio-catalog/references/availability.ts <line> --write   # D59
node ../casio-catalog/references/news.ts --dry                    # D54, usually nothing
npm run catalog:build && npm run catalog:validate
npm run ci:status                                                # D57
```

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

## What to report

Report the survey table, then what changed, then — the most useful line —
**everything refused, by name and with the reason**. A refusal with a name is a
question the next person can answer. A count is not.

Say explicitly whether the scope is now **finished**, and if it is not, which
state the remainder is in. And if a `NO-PAGE` set is what stopped it, say that
somebody with a browser could still settle it: casio.com answers 403 here and
200 to a person.
