# Security notes

## Executed checks

`npm audit --omit=dev --json` was run after the targeted dependency patches.

| Target | Production dependency findings |
|---|---:|
| Node API | 0 |
| Public frontend | 0 |
| Admin frontend | 0 |

## Remediated

| Package | Prior finding | Resolution |
|---|---|---|
| `nodemailer` | Direct high-severity advisories in 7.0.13 | Updated to 10.0.10, which supports Node 20+ and preserves the transport/send API used here; API typecheck/build passed; production audit is clean |
| `fflate` | Moderate malformed-ZIP denial-of-service through jsPDF | Updated the compatible transitive release from 0.8.2 to 0.8.3 under jsPDF's `^0.8.1` range in both frontend lockfiles |

## Remaining development-only findings

The full audits (including dev dependencies) report two transitive ESLint-toolchain findings in each frontend. These packages are not copied into the production static Nginx image.

| Package | Severity | Dependency path | Relevance | Safe path |
|---|---|---|---|---|
| `js-yaml` 4.3.1 | High | `eslint -> @eslint/eslintrc -> js-yaml` | Crafted YAML can consume CPU during lint/config parsing; no browser/runtime reachability | Update the ESLint toolchain using a separately reviewed `npm audit fix`/version bump; not forced during migration |
| `@humanfs/node` 0.16.7 | Moderate | `eslint -> @humanfs/node` | Symlink-following recursive copy affects lint tooling, not the shipped API/static apps | Update ESLint toolchain in a dedicated development-dependency change |

No forced major upgrade was applied. Docker production images use `npm ci --omit=dev` for the API and static frontend artifacts for the UI projects.
