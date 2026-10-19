/**
 * Tailwind 4 writes font-size utilities as
 * `line-height: var(--tw-leading, <size line height>)`, so any `leading-*`
 * on the element wins over the size's line height. In Tailwind 3 the
 * declaration was a plain line height and the cascade decided: a later
 * `md:text-xl` or an `!text-xs` overrode an earlier `leading-*`. Drop the
 * variable fallback so font-size utilities keep the Tailwind 3 behaviour.
 * Runs after @tailwindcss/postcss on the app's stylesheets.
 */
const PATTERN = /^var\(--tw-leading,\s*(.+)\)$/;

module.exports = () => ({
  postcssPlugin: "tailwind3-font-size-line-height",
  Declaration: {
    "line-height": (decl) => {
      const match = PATTERN.exec(decl.value);
      if (match) decl.value = match[1];
    },
  },
});
module.exports.postcss = true;
