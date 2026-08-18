---
name: casio-catalog
description: Research, seed and maintain the Casio Vault catalogue under catalog-src/ — add a series or a single reference from real sources, refresh an existing file, fetch and normalise images, audit what is missing, and work the missing-reference queue. Use when the user says "/casio-catalog ...", or asks to add, refresh, source, image or audit watch references in this repo.
---

# The catalogue skill

You are seeding a watch catalogue whose credibility is the entire product. Most
of what it lists was discontinued years ago and is off casio.com, so the honest
answer is often _nobody has found this out_. Writing that down is the job. A
plausible case diameter is indistinguishable from a real one in a diff, which is
exactly why it must never be written.

Read `catalog-src/lines.yaml` and one existing series file before doing anything.
They are the shape everything you write must match.

## The nine rules

These come from §10.6 of the specification. Each exists because the failure it
prevents is silent — nothing goes red, the catalogue just becomes untrue.

1. **Never rename, re-case or delete a published id.** A published id is in
   `catalog-src/.published-ids.json` and in somebody's collection row, and
   nothing in the database can follow a rename. If the truth demands a change,
   write a tombstone and report it — do not perform it.
2. **Never write a field you did not read from a source.** Unknown is `null`, or
   the key is absent; the two mean the same thing. Never a zero, never "N/A",
   never a reasonable guess.
3. **Every model carries a `source`, and its fields come from that page.** URL
   and `kind` both. A model assembled from memory fails FR-D1 and must not be
   committed — not even one whose reference you are certain of.
4. **Facet values come from the controlled vocabulary** in
   `src/catalog/vocabulary.ts`. If a source states a feature that is not in the
   list, stop, report it, and ask. Never add one as a side effect of a seeding
   run: a vocabulary that grows on its own is the same as no vocabulary.
   - The same goes for a **family** in `lines.yaml` (rule 4a): the series is
     mechanical and you set it without asking; the family is a human judgement
     about how a watch looks. Propose it, report the proposal, do not write it.
   - Editing `src/catalog/vocabulary.ts` or the `families:` block of
     `lines.yaml` is allowed **only** as an explicitly confirmed step of its own,
     in its own commit, never inside a catalogue commit. That is what reconciles
     this rule with rule 5.
5. **Write only inside `catalog-src/` and `public/img/models/`** (plus the two
   confirmed exceptions above). Never `src/`, never the migrations, never the
   workflow, and never anything in the specification vault.
   - **5a. Never publish an image you cannot say where you got** (D41). Every
     image carries `image_credit` — author or source, the basis, and the page —
     and check 5a fails the build without it. Never invent a licence: if the
     page does not state one, it is `rights-reserved` under D11.
6. **Never leave the repo failing `npm run catalog:validate`.** If a run cannot
   end clean, revert your own changes and report why. There is one gate and this
   is it.
7. **Idempotent.** Running the same command twice produces no diff the second
   time. Sort keys the same way, order models the same way, and re-read before
   you write.
8. **`refresh` proposes before it applies.** On a file that already exists, show
   the diff and write it on confirmation. `add` on a new file writes directly.
9. **One commit per series**, message `catalog(<line>/<series>): <what changed>`.

## What a model is

Five fields are required and everything else is optional (D27). `line` and
`series` come from the file the model sits in and are never repeated per model.

```yaml
series:
  id: f-91w # the reference prefix, lowercased — mechanical (D32)
  name: F-91W
  line: vintage # must equal the folder the file is in
  aka: [F91W] # optional; what people actually type
models:
  - id: f-91w-1
    ref: F-91W-1
    source: { url: 'https://…', kind: official }
    # everything below is optional; absent means nobody has found it
    year: 1989
    display: digital
    movement: quartz
    module: '593'
    case: { material: resin, width_mm: 38.2 }
    water_resistance_m: 30
    features: [alarm, stopwatch, el-backlight]
    colorway: Black
    image: f-91w-1 # or null — null is normal and not a failure
    image_credit: # required with an image, refused without one (D41, check 5a)
      author: Multicherry
      licence: cc-by-sa-4.0 # or rights-reserved for a file used under D11
      url: 'https://commons.wikimedia.org/wiki/File:…'
    official_url: 'https://…'
    discontinued: true
```

Three things that are easy to get wrong:

- **`id` is the reference, lowercased, non-alphanumerics to hyphens.**
  `F-91W-1` → `f-91w-1`. Decide it once; it is permanent from the first build.
- **The series id must be a prefix of every `ref` in the file** (check 4a). If a
  reference does not start with it, it belongs in a different file.
- **`discontinued` and a tombstone are different facts.** Discontinued means
  Casio stopped selling it, which is true of most of this catalogue.
  A tombstone means _this catalogue entry_ was retired.

Every object is strict: an unrecognised key fails the parse. That is on purpose —
`wather_resistance_m` would otherwise publish a watch with no water resistance.

## Sourcing

`kind` is shown to the reader, so it is a claim about the page and not
bookkeeping:

| kind        | what it is                                                           |
| ----------- | -------------------------------------------------------------------- |
| `official`  | casio.com or a Casio regional site — including a support/manual page |
| `retailer`  | a shop listing                                                       |
| `community` | a wiki, a forum, an enthusiast database                              |

Try in that order and **stop at the first page that actually states the fields**,
rather than collecting three pages for one watch. A retailer page that lists the
module number is worth more than an official page that lists nothing.

See `references/sources.md` for where this data actually lives, which is not
where you would expect. Two tools live beside it, and the reason they are
committed rather than rewritten each time is that both of the things they know
fail **silently** — an unreadable manual looks like a manual with no
specifications, and a bad roster filter looks like a reference:

```
node .claude/skills/casio-catalog/references/manual.ts 5611 --specs
node .claude/skills/casio-catalog/references/roster.ts modules 2100
node .claude/skills/casio-catalog/references/roster.ts refs 5611 GM-2100
```

`manual.ts` fetches an operation guide, decrypts it, and prints its
Specifications block. It **verifies its own decryption key** against the PDF's
`/U` entry and refuses rather than printing rubbish, and it reports every glyph
it dropped — because the way this went wrong the first time was a font that
names its digits `/one /two /three`, which deleted every number in the document
and left the prose intact.

`roster.ts` reads ShockBase, and its filter is the one the reviewed M2b commits
used, not a new judgement. Do not loosen it to gain references.

**The other route is Casio's own product page (D52), and where it is available it
is the better one** — it states `case`, `water_resistance_m` and `colorway` about
the *reference*, which a module guide cannot, and it names the photograph:

```
node .claude/skills/casio-catalog/references/archive.ts sheen --all   # crawl, slowly
node .claude/skills/casio-catalog/references/seed.ts    sheen --write # YAML from the cache
node .claude/skills/casio-catalog/references/photos.ts  sheen         # the photographs
npm run catalog:images && npm run catalog:build
```

All four are idempotent and the page cache is the progress, so a crawl the
archive cuts short is resumed rather than restarted. `seed.ts --survey` prints
every label and value the cached pages state, which is what to read **before**
trusting the field mapping on a line nobody has seeded this way yet — the rows
Casio prints differ between lines, and "the guide talks about hands" is not a
statement (`sources.md`).

Three silent failures are handled and worth knowing about: the largest capture
is often the emptiest, two generations of the row markup differ by one tag and
return **zero rows** rather than an error on the wrong reader, and the archive's
per-IP cooldown 503s every playback mode at once while the CDX index keeps
answering. A reference that could not be fetched is reported as **unreachable**
and never as D46 — those are different facts about different things.

Rules that keep the sourcing honest:

- **One page per model.** The `source` is the page you read the specs off. Do not
  merge two pages into one entry — if the year came from a wiki and the case from
  a shop, the wiki is the source and the case stays `null`, or the shop is the
  source and the year stays `null`. Whichever page carries more, use that one.
- **A module number is the single most valuable field** after the reference: it
  identifies the movement, and a manual for module 593 tells you the features of
  every watch that uses it. Look for it first.
- **Never infer a year from a module number** or from "looks eighties". D25 is
  explicit: unknown year is `null`, never _circa_.
- **A reference with a letter suffix is a colourway, not a new watch** —
  `F-91W-1` and `F-91W-3` are separate models with separate ids, both real. Do
  not collapse them and do not invent the ones in between.
- If two sources disagree, take the more official one and note nothing. If they
  disagree on the _reference itself_, do not write the model at all — report it.

## The commands

Every command ends the same way: run `npm run catalog:validate`, then print a
change summary — models added, fields filled, fields left `null` for want of a
source, images fetched, and **anything you refused to do**. The refusals are the
most useful line in the summary.

### `/casio-catalog add <line> <series>`

Research a whole series and write `catalog-src/<line>/<series>.yaml`.

1. Confirm the line exists in `lines.yaml`. If it does not, stop.
2. Find the references in the series. Aim for the ones that exist, not a round
   number — a series of nine real references beats twelve with three invented.
3. For each reference, find a page that states its specs and read the fields off
   it. Fill what is there. Leave the rest out.
4. Set `series.id` to the shared reference prefix, lowercased. Do not choose it
   for readability — it is mechanical, and check 4a proves it.
5. If a family suggests itself, say so in the summary. Do not write it.
6. Write the file, models sorted by `ref`.
7. Run `npm run catalog:images` if you fetched any images, then
   `npm run catalog:validate`.
8. Commit as `catalog(<line>/<series>): add N references`.

If the file already exists, this is a `refresh` — switch to it and its rule 8.

### `/casio-catalog add <reference>`

One model. Derive the series prefix from the reference, find the file it belongs
in, and append. Create the file if it is the first of its series. Same sourcing
rules, same ending.

If the reference is already in the catalogue under a different id, report that
and change nothing.

### `/casio-catalog refresh <line|series>`

Re-read an existing file against its sources:

- fill fields that are `null` and can now be sourced,
- append references released since the last run,
- mark `discontinued: true` where the official page has gone,
- **never** remove a model, and never overwrite a field that already has a value
  unless the source contradicts it — in which case report it and ask.

Show the diff, then write on confirmation (rule 8).

### `/casio-catalog images <series>`

Only the images missing from a series that is already written.

1. `npm run catalog:audit` names them, under section 2.
2. Find a usable photograph. Product shot, watch roughly filling the frame, plain
   or transparent ground. A wrist shot, a lifestyle photo or a listing collage is
   not usable — leave it and say so.
3. **Prove it is the right watch before taking it.** The test that has actually
   worked: the _filename_ carries the reference with a boundary after it —
   `Casio-F-91W-1-Black.png` is F-91W-1 and `Casio-F-91WM-1B-Metallic.png` is
   not, and a substring match hands the second to the first. Where the source
   names its files `50016.jpg`, the page's own lead image is the best available
   evidence and is **not** proof: look at it, and prefer a dial that prints the
   model name. Anything you could not verify is reported, not written.
4. Save into `catalog-src/images/raw/<id>.<ext>`. **The filename is the model
   id** — that is the whole convention, and `catalog:images` refuses a filename
   that could not be one. Raw files are not committed.
5. `npm run catalog:images` normalises to 400 px and 800 px WebP into
   `public/img/models/`. It refuses anything over the 40 KB / 110 KB budgets —
   crop the source or find a cleaner one; do not lower the budget.
6. Set `image: <id>` **and `image_credit`** on the model, then validate. The
   credit is not optional and check 5a fails the build without it (D41):

   ```yaml
   image: f-91w-1
   image_credit:
     author: Multicherry # the person, for a licensed file; the site, otherwise
     licence: cc-by-sa-4.0 # or rights-reserved for a file used under D11
     url: 'https://commons.wikimedia.org/wiki/File:…' # the page it came from
   ```

**Two rules about where an image may come from (D41).** A freely licensed
photograph — Wikimedia Commons, the wider CC pool, or the client's own — is
credited by its author under its own licence. Casio's product photography and an
archive's or a retailer's is `rights-reserved`, credited to the source, used
under D11: non-commercial, attributed, withdrawn in full on request. **Never
guess a licence.** If the page does not say, it is `rights-reserved`.

**Do not publish a photograph narrower than 300 px.** It renders softer than the
typographic tile it replaces, and that tile is a designed primary state rather
than a fallback — a blurry picture is a downgrade, not an improvement.

An image that cannot be found honestly is `image: null`, and so is one you could
not verify. Ten of the sixty-one Vintage references sit that way on purpose.

### `/casio-catalog audit`

Run `npm run catalog:audit` and read it back. It changes nothing, fails nothing,
and works on a catalogue that is currently broken. Five sections:

1. **Unsourced fields** — per series, which fields are missing and on which
   models. This is the work list.
2. **Missing images** — no photograph, a claimed file that is not there, and any
   `.webp` no model claims.
3. **Out-of-vocabulary facets** — values the schema refused, and values carried
   by exactly one model, which read the same as a typo that got approved.
4. **Budget** — the size against NFR-4's 150 KB and §6.2's split triggers.
5. **Id drift** — anything published that has gone, the ids the next build makes
   permanent, and the tombstones.

Report what it says. Do not fix things you were not asked to fix.

### `/casio-catalog requests`

The D22 queue of references visitors reported as missing.

**Precondition:** `catalog_requests` ships at M8. If the table does not exist, or
`.env.local` has no service-role key, say so and stop. Do not create either.

1. Read the queue **read-only**, through the service role, from `.env.local`
   (never committed, never a GitHub secret, never in the browser).
2. **Never write to the table.** Not a status column, not a delete. The queue is
   cleared by a separate maintenance script the client runs deliberately, so a
   half-finished run cannot lose somebody's report.
3. Group by line and series. For each entry decide one of three things:
   - genuinely missing → offer to run `add`,
   - already catalogued under a name the reporter did not recognise → say which,
   - **not a Casio reference at all** → report and skip. The field is a text
     input and will contain jokes and mistakes. Do not research it.

## When to stop and ask

Stop, report, and wait — do not decide any of these alone:

- a feature, display or movement value that is not in the vocabulary,
- a new family for `lines.yaml`,
- a reference whose sources contradict each other on the reference itself,
- anything that would change a published id,
- a `ref_pattern` that is rejecting references you believe are real. The fix is
  usually the pattern, but changing it is a decision about a whole line —
  meanwhile, acknowledge the individual case with a `# ref-exception: <why>`
  comment on the entry, which is what turns the warning off.

## The one thing to remember

The catalogue is reviewed by a human reading `git diff` on a YAML file. Write for
that reader. A field that is absent is a question somebody can answer later; a
field that is wrong is a lie the site will repeat for years.
