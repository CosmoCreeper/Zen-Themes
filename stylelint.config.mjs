/** @type {import('stylelint').Config} */
export default {
  extends: ["stylelint-config-standard"],
  rules: {
    "media-query-no-invalid": [true, { ignoreFunctions: ["-moz-pref"] }],
    "no-descending-specificity": null,
    "selector-type-no-unknown": null,
    "selector-id-pattern": null,
    "no-duplicate-selectors": null,
    "declaration-property-value-no-unknown": [
      true,
      {
        ignoreProperties: {
          "max-width": ["auto", "/fr$/"],
        },
      },
    ],
  },
};
