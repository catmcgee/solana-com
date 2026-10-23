# Code Hike transform goldens

Goldens for `build-first-program`, `account-structure` and
`deferred-execution` in en, fr and ru.

```
__fixtures__/codehike-goldens/<page>/<locale>/
  in.mdx     # snapshot of the real page before convert (commit c06186ae1)
  out.mdx    # expected output after ALL Code Hike transforms (and nothing else)
  meta.json  # { path, locale, collection }
```

`test/codehike-goldens.test.ts` asserts the output, idempotency, zero residual
Code Hike syntax those transforms own, and a no-JS fallback after every mermaid
fence. Other constructs (`<Callout>`, `<CodeTabs>`, `!!`
fence meta, `!focus`/`!mark`, `_rs\`x\``) are intentionally still present:
later transforms in the pipeline convert them.

Regenerate after an intended change with
`UPDATE_GOLDENS=1 pnpm --filter @workspace/docs-tooling test codehike-goldens`.
