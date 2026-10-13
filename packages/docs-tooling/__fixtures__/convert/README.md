# Convert fixtures

One folder per transform (the folder name is the transform `name`), one
sub-folder per case:

```
__fixtures__/convert/<transform>/<case>/
  in.mdx      # input
  out.mdx     # expected output after ONLY this transform runs
  meta.json   # optional: { "path", "locale", "collection" } (default: en docs)
```

`test/convert-fixtures.test.ts` runs every case for every registered transform,
asserts `out.mdx`, and asserts idempotency (`convert(out) === out`). Every
transform needs at least one en case and one locale case (spec §4.3).
`example-callout-rename` is a test-only transform that exercises the harness.
