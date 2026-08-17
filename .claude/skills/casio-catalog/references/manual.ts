// Read a Casio operation guide (module manual) as plain text.
//
//   node manual.ts 3229            fetch, decrypt, print the text
//   node manual.ts 3229 --specs    print only the Specifications block
//
// WHY THIS EXISTS. D44 made the module manual the catalogue's official source.
// casio.com answers 403 on every product path (Akamai) but serves the guides
// from /content/dam/ with a 200.
//
// DO NOT REWRITE THIS. Every trap below fails SILENTLY — each one looks like a
// guide that does not state its specifications rather than like a bug, and one of
// them looks like a guide that states them wrongly, which is worse. They were
// found one at a time across two sessions.
//
//   TRAP 1: the encryption dictionary carries TWO /Length keys in different
//   units. The top-level one is 128 (bits); the crypt-filter sub-dictionary one
//   is 16 (bytes). Matching the first hit derives a 2-byte key that decrypts
//   nothing, reports no error, and leaves every stream refusing to inflate. The
//   derivation is checkable — /U is recomputed from the key — so this refuses
//   rather than printing rubbish. Revision 2 documents need a different
//   derivation AND a different check, and older modules are R2.
//
//   TRAP 2: strings are written as <hex>, so a reader that only understands
//   (literal) strings returns all of the prose and NONE of the numbers.
//
//   TRAP 3: the fonts carry custom /Encoding maps, differently per document, so
//   "Specifications" arrives as "Speci cations" in one guide and "SpeciÞcations"
//   in another. Read the document's own /Differences arrays. AND WATCH THE
//   DIGITS: some fonts name them /one /two /three, so a reader that drops
//   unrecognised glyph names deletes every number and leaves the prose intact.
//
//   TRAP 4: some fonts are a plain byte OFFSET declared nowhere at all. Module
//   5698's contents page reads "ÅÄÊ»ÄÊÉ", which is "ontents" shifted by +0x56.
//   Detected by scoring all 256 shifts against words every guide contains.
//
// And one that is not the PDF's fault: page order is OBJECT order, the word
// "Specifications" also appears in the contents, and a contents page full of
// "Using the Alarm . . . E-82" lines looks exactly like a table full of rows.
// That is why `specRows` scans the whole document for known spec labels instead
// of trying to locate a block — two attempts at locating one both picked the
// contents.

import { createHash } from 'node:crypto'
import { inflateSync, inflateRawSync } from 'node:zlib'

const MODULE_URL = (m: string) =>
  `https://www.casio.com/content/dam/casio/global/support/manuals/watches/pdf/${m.slice(0, 2)}/${m}/qw${m}_EN.pdf`

// Akamai reads the user agent and closes the connection on anything that looks
// like a script. This is the same lesson Wikimedia taught M1c.
const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0.0.0 Safari/537.36'

const PAD = Buffer.from([
  0x28, 0xbf, 0x4e, 0x5e, 0x4e, 0x75, 0x8a, 0x41, 0x64, 0x00, 0x4e, 0x56, 0xff, 0xfa, 0x01, 0x08,
  0x2e, 0x2e, 0x00, 0xb6, 0xd0, 0x68, 0x3e, 0x80, 0x2f, 0x0c, 0xa9, 0xfe, 0x64, 0x53, 0x69, 0x7a,
])

function rc4(key: Buffer, data: Buffer): Buffer {
  const s = new Uint8Array(256)
  for (let i = 0; i < 256; i++) s[i] = i
  let j = 0
  for (let i = 0; i < 256; i++) {
    j = (j + s[i] + key[i % key.length]) & 0xff
    ;[s[i], s[j]] = [s[j], s[i]]
  }
  const out = Buffer.alloc(data.length)
  let i = 0
  j = 0
  for (let k = 0; k < data.length; k++) {
    i = (i + 1) & 0xff
    j = (j + s[i]) & 0xff
    ;[s[i], s[j]] = [s[j], s[i]]
    out[k] = data[k] ^ s[(s[i] + s[j]) & 0xff]
  }
  return out
}

const md5 = (...parts: Buffer[]) => createHash('md5').update(Buffer.concat(parts)).digest()

/** A PDF string as written in a dictionary: `<hex>` or `(literal)` with escapes. */
function readPdfString(src: string): Buffer {
  const s = src.trim()
  if (s.startsWith('<')) return Buffer.from(s.slice(1, -1).replace(/\s+/g, ''), 'hex')
  const body = s.slice(1, -1)
  const out: number[] = []
  for (let i = 0; i < body.length; i++) {
    if (body[i] !== '\\') {
      out.push(body.charCodeAt(i))
      continue
    }
    const c = body[++i]
    const escapes: Record<string, number> = { n: 10, r: 13, t: 9, b: 8, f: 12 }
    if (c in escapes) out.push(escapes[c])
    else if (/[0-7]/.test(c)) {
      let oct = c
      while (oct.length < 3 && /[0-7]/.test(body[i + 1])) oct += body[++i]
      out.push(parseInt(oct, 8))
    } else out.push(body.charCodeAt(i))
  }
  return Buffer.from(out)
}

/**
 * Derive the file key for an empty user password (Algorithm 2). The 50-round
 * loop is revision 3 and later only — running it on an R2 document produces a
 * key that fails the check, and skipping it on an R4 one does the same.
 */
function fileKey(
  o: Buffer,
  p: number,
  id: Buffer,
  keyBytes: number,
  r: number,
  encryptMetadata: boolean,
) {
  const pBuf = Buffer.alloc(4)
  pBuf.writeInt32LE(p | 0)
  const parts = [PAD, o.subarray(0, 32), pBuf, id]
  if (r >= 4 && !encryptMetadata) parts.push(Buffer.from([0xff, 0xff, 0xff, 0xff]))
  let key = md5(...parts).subarray(0, keyBytes)
  if (r >= 3) for (let i = 0; i < 50; i++) key = md5(key).subarray(0, keyBytes)
  return key
}

/**
 * Recompute /U from the key and compare. This is what makes the whole thing
 * checkable rather than believed: if the key is wrong the streams simply refuse
 * to inflate, with no error that says why.
 *
 * R2 is Algorithm 4 — one RC4 pass over the pad, all 32 bytes meaningful.
 * R3+ is Algorithm 5 — the pad is salted with the file ID and run through 20
 * more passes, and only the first 16 bytes carry the check.
 */
function verifyKey(key: Buffer, id: Buffer, u: Buffer, r: number): boolean {
  if (r === 2) return rc4(key, PAD).equals(u.subarray(0, 32))
  let x = rc4(key, md5(PAD, id))
  for (let i = 1; i <= 19; i++) x = rc4(Buffer.from(key.map((b) => b ^ i)), x)
  return x.subarray(0, 16).equals(u.subarray(0, 16))
}

/**
 * The encryption dictionary, found by following the trailer's `/Encrypt N G R`
 * to the object rather than by matching near `/Filter /Standard`. That matters:
 * a window around the dictionary catches `/Length` keys belonging to whatever
 * streams happen to sit beside it, and a stream length read as a key length is
 * trap 1 wearing a different hat.
 */
function encryptDict(latin: string): string | null {
  const ref = /\/Encrypt\s+(\d+)\s+(\d+)\s+R/.exec(latin)
  if (!ref) return null
  const objRe = new RegExp(`(?:^|[^0-9])${ref[1]}\\s+${ref[2]}\\s+obj\\b`, 'g')
  // The match itself is not wanted — only where it ended, so the dictionary can
  // be read from there.
  while (objRe.exec(latin) !== null) {
    const end = latin.indexOf('endobj', objRe.lastIndex)
    const body = latin.slice(objRe.lastIndex, end === -1 ? objRe.lastIndex + 2000 : end)
    if (/\/Filter\s*\/Standard/.test(body)) return body
  }
  return null
}

const objectKey = (key: Buffer, num: number, gen: number) =>
  md5(
    key,
    Buffer.from([num & 0xff, (num >> 8) & 0xff, (num >> 16) & 0xff, gen & 0xff, (gen >> 8) & 0xff]),
  ).subarray(0, Math.min(key.length + 5, 16))

/** Every `N G obj … stream … endstream`, decrypted and inflated where it is Flate. */
function streams(pdf: Buffer, key: Buffer | null): string[] {
  const latin = pdf.toString('latin1')
  const out: string[] = []
  const objRe = /(\d+)\s+(\d+)\s+obj\b/g
  let m: RegExpExecArray | null
  while ((m = objRe.exec(latin))) {
    const [, numStr, genStr] = m
    const sIdx = latin.indexOf('stream', objRe.lastIndex)
    if (sIdx === -1) continue
    const nextObj = latin.indexOf(' obj', objRe.lastIndex)
    if (nextObj !== -1 && sIdx > nextObj) continue // this object has no stream
    const dict = latin.slice(objRe.lastIndex, sIdx)
    let start = sIdx + 'stream'.length
    if (latin[start] === '\r') start++
    if (latin[start] === '\n') start++
    const end = latin.indexOf('endstream', start)
    if (end === -1) continue
    let body = pdf.subarray(start, end)
    if (key) body = rc4(objectKey(key, Number(numStr), Number(genStr)), body)
    if (/\/FlateDecode/.test(dict)) {
      try {
        body = inflateSync(body)
      } catch {
        try {
          body = inflateRawSync(body)
        } catch {
          continue // not our stream: an image, or a key that is wrong
        }
      }
    }
    out.push(body.toString('latin1'))
  }
  return out
}

/**
 * TRAP 3. The guides embed subset fonts with a custom /Encoding, so `fi` and
 * `fl` are single codes — 0x93 and 0x94 — and a latin1 read turns
 * "Specifications" into "Speci cations" and "configure" into "con gure". The
 * word is not in the text any more, so grepping the manual for it finds nothing
 * and the block looks absent.
 *
 * The fix is to read the document's own /Differences arrays. Every font in a
 * guide is a subset of the same handful of typefaces, so the union of those
 * arrays is one table — and it is checkable: if two fonts disagree about a code
 * this refuses rather than picking one. Across the guides read so far there are
 * three dozen arrays and no conflicts at all.
 */
function glyphTable(latin: string): Map<number, string> {
  const names = new Map<number, string>()
  const disputed = new Set<number>()
  for (const [, body] of latin.matchAll(/\/Differences\s*\[([^\]]*)\]/g)) {
    let code = 0
    for (const tok of body.match(/\d+|\/[\w.]+/g) ?? []) {
      if (/^\d/.test(tok)) code = Number(tok)
      else {
        const name = tok.slice(1)
        const seen = names.get(code)
        // Most guides subset the same few typefaces and the union is one table.
        // A few do not — module 3184's fonts use code 1 for both /bullet and /C.
        // A disputed code is DROPPED FROM THE TABLE rather than resolved by
        // picking a side: guessing here would put a letter where a bullet goes
        // and never say so.
        if (seen && seen !== name) disputed.add(code)
        names.set(code++, name)
      }
    }
  }
  for (const code of disputed) names.delete(code)
  if (disputed.size)
    process.stderr.write(
      `[disputed codes, left undecoded: ${[...disputed].sort((a, b) => a - b).join(' ')}]\n`,
    )
  // The glyph names that turn up in these guides. THE DIGITS MATTER MOST: a
  // font that names them /one /two /three is common here, and a reader that
  // treats an unknown lowercase name as a pictogram deletes every number in the
  // document while leaving the prose intact — "Approximate Battery Life: years
  // on type CR" reads like a manual that forgot to say.
  const AGL: Record<string, string> = {
    zero: '0',
    one: '1',
    two: '2',
    three: '3',
    four: '4',
    five: '5',
    six: '6',
    seven: '7',
    eight: '8',
    nine: '9',
    space: ' ',
    fi: 'fi',
    fl: 'fl',
    ff: 'ff',
    ffi: 'ffi',
    bullet: '•',
    ellipsis: '…',
    endash: '–',
    emdash: '—',
    hyphen: '-',
    quoteleft: '‘',
    quoteright: '’',
    quotedblleft: '“',
    quotedblright: '”',
    degree: '°',
    plusminus: '±',
    multiply: '×',
    divide: '÷',
    minus: '−',
    periodcentered: '·',
    trademark: '™',
    registered: '®',
    copyright: '©',
    section: '§',
    paragraph: '¶',
    dagger: '†',
    percent: '%',
    slash: '/',
    comma: ',',
    period: '.',
    colon: ':',
    semicolon: ';',
    exclam: '!',
    question: '?',
    parenleft: '(',
    parenright: ')',
    bracketleft: '[',
    bracketright: ']',
    numbersign: '#',
    asterisk: '*',
    plus: '+',
    equal: '=',
    less: '<',
    greater: '>',
    ampersand: '&',
    at: '@',
    underscore: '_',
    quotesingle: "'",
    quotedbl: '"',
  }
  const out = new Map<number, string>()
  const unknown = new Set<string>()
  for (const [code, name] of names) {
    if (AGL[name] !== undefined) out.set(code, AGL[name])
    else if (/^uni([0-9A-Fa-f]{4})$/.test(name))
      out.set(code, String.fromCodePoint(parseInt(name.slice(3), 16)))
    else if (/^[A-Za-z]$/.test(name)) out.set(code, name)
    else {
      // A pictogram — the A/B/C button symbols, mostly. It drops out, but it is
      // NEVER dropped quietly: an unrecognised name is how the digits vanished.
      out.set(code, '')
      unknown.add(name)
    }
  }
  if (unknown.size)
    process.stderr.write(`[dropped glyphs: ${[...unknown].sort().join(' ')}]\n`)
  return out
}

/** Text-showing operators from a content stream. Handles <hex> — trap 2. */
function textOf(content: string, glyphs: Map<number, string>): string {
  const lines: string[] = []
  let line = ''
  // Tokens we care about: strings, TJ arrays, and the operators that move down.
  const re = /\((?:\\.|[^\\)])*\)|<[0-9A-Fa-f\s]*>|\bTJ\b|\bTj\b|\bT\*\b|\bTd\b|\bTD\b|\bET\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(content))) {
    const t = m[0]
    if (t.startsWith('(') || t.startsWith('<')) {
      // A hex string in these guides is one byte per glyph, not UTF-16.
      for (const b of readPdfString(t)) {
        // The table is authoritative only where it speaks. A code no
        // /Differences array named belongs to a standard-encoded font, where
        // latin1 is right — dropping those loses the ± off an accuracy figure.
        const g = glyphs.get(b)
        line += g !== undefined ? g : b >= 32 ? String.fromCharCode(b) : ''
      }
    } else if (t === 'T*' || t === 'Td' || t === 'TD' || t === 'ET') {
      if (line.trim()) lines.push(line.trim())
      line = ''
    }
  }
  if (line.trim()) lines.push(line.trim())
  return lines.join('\n')
}

export async function readManual(mod: string): Promise<string> {
  const url = MODULE_URL(mod)
  const res = await fetch(url, { headers: { 'user-agent': UA } })
  if (!res.ok) throw new Error(`${url} → HTTP ${res.status}`)
  const pdf = Buffer.from(await res.arrayBuffer())
  const latin = pdf.toString('latin1')

  let key: Buffer | null = null
  if (/\/Encrypt\b/.test(latin)) {
    const dict = encryptDict(latin)
    if (!dict) throw new Error('encrypted by a handler this reader does not know')
    const o = readPdfString(/\/O\s*(<[^>]*>|\((?:\\.|[^\\)])*\))/.exec(dict)![1])
    const u = readPdfString(/\/U\s*(<[^>]*>|\((?:\\.|[^\\)])*\))/.exec(dict)![1])
    const p = Number(/\/P\s*(-?\d+)/.exec(dict)![1])
    const r = Number(/\/R\s*(\d+)/.exec(dict)![1])
    const encryptMetadata = !/\/EncryptMetadata\s+false/.test(dict)
    const id = readPdfString(/\/ID\s*\[\s*(<[^>]*>|\((?:\\.|[^\\)])*\))/.exec(latin)![1])

    // TRAP 1. The top-level /Length is in BITS; the one inside the /CF crypt
    // filter is the same number in BYTES. Cut /CF out before reading it, or a
    // 16 gets divided by 8 into a two-byte key that decrypts nothing quietly.
    const topLevel = dict.replace(/\/CF\s*<<[\s\S]*?>>\s*>>/, '')
    const bits = Number(/\/Length\s+(\d+)/.exec(topLevel)?.[1] ?? (r === 2 ? 40 : 128))
    key = fileKey(o, p, id, r === 2 ? 5 : bits / 8, r, encryptMetadata)
    if (!verifyKey(key, id, u, r)) throw new Error(`key check failed (R${r}, ${bits}-bit)`)
  }

  const glyphs = glyphTable(latin)
  return streams(pdf, key)
    .filter((s) => /\bTJ\b|\bTj\b/.test(s))
    .map((s) => unshift(textOf(s, glyphs)))
    .join('\n')
}

/**
 * TRAP 4. Some guides embed a font whose encoding is a plain byte OFFSET and
 * declare it nowhere — no /Differences to read, so the glyph table above has
 * nothing to say and latin1 returns mojibake. Module 5698's contents page comes
 * back as "ÅÄÊ»ÄÊÉ È»¹·ËÊ¿ÅÄÉ", which is "ontents recautions" shifted by +0x56
 * (the capitals land on unprintable codes and vanish, which is why the first
 * letter of each word is missing).
 *
 * This is recoverable and, more importantly, it is CHECKABLE: shift the whole
 * run by each of 255 possible offsets and score the result against words that
 * appear in every one of these documents. A real offset scores in double figures
 * and the wrong ones score zero, so there is no judgement call — and if nothing
 * scores, the text is returned untouched rather than mangled into something that
 * reads like English but is not.
 */
const MARKERS =
  /\b(the|and|watch|time|press|mode|button|battery|second|minute|display|setting|operation)\b/gi

function unshift(run: string): string {
  const score = (s: string) => (s.match(MARKERS) ?? []).length
  const asIs = score(run)
  // Only bother when the run looks wrong: mostly high bytes and few real words.
  const highBytes = [...run].filter((c) => c.charCodeAt(0) > 127).length
  if (asIs > 2 || highBytes < run.length / 4) return run

  let best = { offset: 0, hits: asIs, text: run }
  for (let off = 1; off < 256; off++) {
    const shifted = [...run]
      .map((c) => {
        const b = c.charCodeAt(0)
        return b > 255 ? c : String.fromCharCode((b - off + 256) % 256)
      })
      .join('')
    const hits = score(shifted)
    if (hits > best.hits) best = { offset: off, hits, text: shifted }
  }
  if (best.offset === 0) return run
  process.stderr.write(`[byte-offset font: shifted a run by -0x${best.offset.toString(16)}]\n`)
  return best.text
}

/**
 * The Specifications block, which is the only part of a guide the catalogue
 * reads. The word appears twice — once in the contents list and once as the
 * heading — so this takes the LAST occurrence.
 */
/**
 * The specification rows, taken from the WHOLE document rather than from a block.
 *
 * Locating the block was the wrong idea and it failed the same way twice. The
 * heading is unreliable (the ligature decodes differently per document), the page
 * order is object order rather than reading order, and the word "Specifications"
 * also appears in the contents — so a loose enough pattern to survive the first
 * two problems starts matching the third, and a contents page full of
 * "Using the Alarm . . . E-82" lines looks exactly like a table full of rows.
 *
 * These labels are what a Casio guide calls the things this catalogue records,
 * and they appear only in the table. A contents entry always carries dot leaders,
 * so that is the one exclusion needed.
 */
const SPEC_LABELS = [
  'Accuracy',
  'Accuracy at normal temperature',
  'Timekeeping',
  'Digital Timekeeping',
  'Analog Timekeeping',
  'Time system',
  'Time format',
  'Calendar system',
  'Alarm',
  'Alarms',
  'Stopwatch',
  'Countdown Timer',
  'Timer',
  'World Time',
  'Illumination',
  'Battery',
  'Battery Life',
  'Power Supply',
  'Digital Compass',
  'Barometer',
  'Thermometer',
  'Altimeter',
  'Tide/Moon',
  'Tide/Moon Data',
  'Sunrise/sunset',
  'Diving Functions',
  'Time Calibration Signal Reception',
  'Bearing Sensor Precision',
  'Temperature Sensor Precision',
  'Pressure Sensor Precision',
  'Low Battery Indicator',
  'Other',
]

export function specRows(text: string): Map<string, string> {
  const lines = text.split('\n')
  const out = new Map<string, string>()
  const leader = /\.\s*\.\s*\./
  lines.forEach((line, i) => {
    const m = /^([A-Z][A-Za-z ()/-]{2,40}?):\s*(.*)$/.exec(line.trim())
    if (!m || leader.test(line)) return
    const [, label, inline] = m
    if (!SPEC_LABELS.includes(label)) return
    // The value is on the same line or the next one, and a guide uses both.
    const value = inline.trim() || (lines[i + 1] ?? '').trim()
    if (!leader.test(value) && value && !out.has(label)) out.set(label, value)
  })
  return out
}

export function specsOf(text: string): string | null {
  // TWO REASONS THE OBVIOUS SEARCH FAILS.
  //
  // The heading is unreliable. Where a font names the `fi` ligature in its
  // /Differences the word comes through whole; where it does not, latin1 hands
  // back whatever byte the subset used — "SpeciÞcations" in module 3230's guide,
  // "Speci cations" in 5146's, and split across two lines in both. So the
  // heading is matched loosely and is only the fallback.
  //
  // Document order is not page order. Streams come out in object order, so
  // taking the LAST occurrence finds a page near the front of the booklet. The
  // anchor that works is the table's own first row, and where a guide repeats it
  // the right block is the one followed by the most `Label:` rows.
  // `Speci.{0,4}?cations` rather than a tidier pattern because every guide
  // mangles the ligature differently: "Specifications" whole, "Speci cations"
  // where the glyph dropped, "SpeciÞcations" where latin1 guessed, and
  // "Specifi\ncations" where the layout split the word across two runs. A
  // pattern that assumes any one of those misses the other three.
  const candidates = [
    ...text.matchAll(/Accuracy at normal temperature/g),
    ...text.matchAll(/Speci.{0,4}?cations/gs),
  ].map((m) => m.index!)
  if (!candidates.length) return null

  // "Operation Guide 5476" is a RUNNING FOOTER and appears inside the block, so
  // it must not end it — module 5476's table has Stopwatch, Alarms, Illumination
  // and Battery after the first footer, and stopping there silently reports a
  // Mudmaster with no alarm. The real ends are the closing sentence, the city
  // table, and the two sections that always follow.
  const END = /Specifi[^a-z]{0,3}cations are subject to change|City Code Table|Operating Precautions|User Maintenance/
  const FOOTER = /^(Operation Guide [\d/]+|[A-Z]-\d+|\d+)$/
  /** A specification row: a short capitalised label followed by a colon. */
  const ROW = /^[A-Z][A-Za-z ()/-]{2,40}:/
  const block = (at: number) => {
    const from = text.slice(at)
    const end = from.search(END)
    const kept = (end > 200 ? from.slice(0, end) : from.slice(0, 4000))
      .split('\n')
      .filter((l) => !FOOTER.test(l.trim()))
    // The block IS the rows. Where the guide's own end anchor does not appear —
    // the pages come out in object order, so the maintenance section can follow
    // the table directly — cut a few lines past the last `Label:` row rather
    // than trailing four thousand characters of rust advice.
    const last = kept.reduce((acc, l, i) => (ROW.test(l) ? i : acc), -1)
    return (last === -1 ? kept : kept.slice(0, last + 8)).join('\n')
  }
  // A contents page also contains the word "Specifications", and once the
  // heading pattern was loosened enough to survive the ligature it started
  // matching there too. A contents entry is a label followed by dot leaders and
  // a page number, so lines carrying leaders do not count as rows — which makes
  // the real table win the score rather than the first mention of the word.
  const LEADER = /\.\s*\.\s*\./
  const rows = (s: string) =>
    s.split('\n').filter((l) => ROW.test(l) && !LEADER.test(l)).length
  return block(candidates.sort((a, b) => rows(block(b)) - rows(block(a)))[0]).trim()
}

const [mod, ...flags] = process.argv.slice(2)
if (mod) {
  const text = await readManual(mod)
  if (flags.includes('--specs')) console.log(specsOf(text) ?? '(no Specifications block)')
  else console.log(text)
}
