module.exports = {
  plugins: [
    "@tailwindcss/postcss",
    // Keep Tailwind 4's output in Tailwind 3's cascade order (see the files).
    // Absolute paths: Next.js resolves plugin names from its own location.
    require.resolve("./postcss/tailwind3-font-size-line-height.js"),
    require.resolve("./postcss/tailwind3-space-divide.js"),
    require.resolve("./postcss/tailwind3-variant-order.js"),
    "postcss-flexbugs-fixes",
    [
      "postcss-preset-env",
      {
        autoprefixer: {
          flexbox: "no-2009",
        },
        stage: 3,
        features: {
          "custom-properties": false,
        },
      },
    ],
  ],
};
