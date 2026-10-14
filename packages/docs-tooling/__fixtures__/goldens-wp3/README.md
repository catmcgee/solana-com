# WP3 goldens (Code Hike transforms)

Spec §9 WP3 acceptance: goldens for `build-first-program`,
`account-structure` and `deferred-execution` in en, fr and ru.

```
__fixtures__/goldens-wp3/<page>/<locale>/
  in.mdx     # snapshot of the real page before convert (commit c06186ae1)
  out.mdx    # expected output after ALL WP3 transforms (and nothing else)
  meta.json  # { path, locale, collection }
```

`test/wp3-goldens.test.ts` asserts the output, idempotency, zero residual
Code Hike syntax owned by WP3, and a no-JS fallback after every mermaid
fence. Other work packages' constructs (`<Callout>`, `<CodeTabs>`, `!!`
fence meta, `!focus`/`!mark`, `_rs\`x\``) are intentionally still present:
WP2/WP5 transforms convert them later in the pipeline. The full-pipeline
corpus snapshot (§4.3) is WP12's.

Regenerate after an intended change with
`UPDATE_GOLDENS=1 pnpm --filter @workspace/docs-tooling test wp3-goldens`.
