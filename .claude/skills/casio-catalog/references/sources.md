# Where this data actually lives

Not where you would expect. Read this before researching anything — every line
of it was learned by getting it wrong first.

## casio.com is open, and it is not the part you want

| Path | Answers |
| --- | --- |
| `casio.com/us/watches/...`, `/intl/`, `/jp/`, `gshock.casio.com` | **403** |
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

**For every other line it is unsolved.** What has been checked:

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
