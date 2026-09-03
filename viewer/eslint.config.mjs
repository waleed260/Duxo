import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

// eslint-config-next ships a native flat config from v15.3 on; spread it
// directly rather than through FlatCompat. It already ignores .next/, out/,
// build/ and next-env.d.ts.
const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: ["tailwind.config.ts"],
  },
  {
    rules: {
      // §9.8 — Design-token lint: no raw hex values in component code outside
      // the token file (tailwind.config.ts). This catches violations like
      // sm:text-[44px] or inline style={{ color: '#ef443b' }}.
      "no-restricted-syntax": [
        "warn",
        {
          selector: "Literal[value=/^#[0-9a-fA-F]{3,8}$/]",
          message:
            "Use Tailwind design tokens instead of raw hex values (§9.8). See tailwind.config.ts for available tokens.",
        },
      ],
      "react/no-unescaped-entities": "off",
      // eslint-plugin-react-hooks 6 (pulled in by eslint-config-next 16) adds
      // this rule as an error. The four call sites it flags are pre-existing
      // mount-time patterns — OS detection, seeding a form from the loaded
      // Clerk user, a guard clause that sets an error phase. Refactoring them
      // to derived state is a behaviour change to make deliberately with a
      // deployment to verify against, not as fallout from a framework bump.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
];

export default eslintConfig;
