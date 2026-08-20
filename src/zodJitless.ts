import { config } from 'zod'

/**
 * S7 — **Zod is told not to reach for a JIT the CSP is going to refuse, and it
 * has to be told before any schema exists.**
 *
 * Zod 4 compiles a schema into a `new Function` where it can, and probes for the
 * capability by constructing an empty one inside a try/catch. Under
 * `script-src 'self'` that construction is denied. The throw is caught and Zod
 * falls back to its interpreted path, so nothing is broken — but the denial is
 * still recorded as a `securitypolicyviolation`, a real entry in Chrome's Issues
 * panel, and it was costing a Lighthouse Best-Practices audit. Zod's own source
 * names this case and provides `jitless` for it.
 *
 * It changes no behaviour in the browser. The compiled path Zod was reaching for
 * is exactly what the CSP refuses, so the interpreted path is what ran either
 * way; all this removes is the failed attempt.
 *
 * **This is a separate module because of when it has to run.** Setting it in
 * `main.tsx`'s body was too late: an `import` evaluates the imported module
 * first, so `./App` — and with it `catalog/schema.ts`, which builds `CATALOG` at
 * module scope — had already constructed schemas and fired the probe before the
 * first statement of `main.tsx` ran. A module cannot be imported after the thing
 * it configures, so it is imported *before* it, and the import order in
 * `main.tsx` is load-bearing.
 *
 * Not set beside the schema itself, because `scripts/` runs in Node under no CSP
 * and should keep the compiled path it can actually use.
 */
config({ jitless: true })
