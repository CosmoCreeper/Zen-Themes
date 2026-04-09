/** @type {import('stylelint').Config} */
export default {
  extends: ["stylelint-config-standard"],
  rules: {
    "media-query-no-invalid": [
      true,
      { "ignoreFunctions": ["-moz-pref"] }
    ]
  }
};