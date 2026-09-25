# User-flow remediation

Audit date: 2026-09-25. Base: `develop` at `841c901` (PR #54 merged); changes
below are implemented on `feature/user-flow-improvements` and await its PR review.
Scope comes from a manual user-flow review. The requirements below are checked
against the hackathon case, the organizer's curriculum package, the architecture,
API contract, roadmap, and brandbook v1.1.

## Brand and product rules

- Keep the student workspace calm and readable: 18 px body text, 56 px primary
  actions, light surfaces, and the organizer's exact CSS tokens and fonts.
- Keep the next action prominent on the student home page; place the course
  catalog and statistics below it. Explain every score and percentage.
- Show every learning status with both its required icon and color. Use amber
  sparingly, and reserve red for failed automatic checks.
- Address students as «ты» and staff as «вы». Use line icons rather than emoji.
- Keep all three roles working; the case requires student, curator, and admin
  paths. Continue to import the official 3 courses / 9 modules / 30 steps and
  keep answer keys and grader-only criteria hidden from students.
- Respect immutable published revisions and preserve enrollment/submission
  history. A course or account action must not silently erase referenced work.

The sample course route on brandbook page 6 allows moving on while a curator
reviews a step. The owner confirmed strict sequencing for this product: each
previous step must be `accepted`. This explicit product rule takes precedence
over that illustrative route; all other brandbook rules remain in force.

## Findings and acceptance work

| # | Finding from manual review | Result in current feature branch |
|---|---|---|---|
| 1 | Login lacks product introduction and split layout | Added two-panel login with platform purpose, separate form, line-art decoration, responsive layout, and existing brand tokens/fonts. |
| 2 | Catalog, course cards, progress and banners | Catalog and course overview are distinct; full-card links, completed/remaining/% rows, banner upload/revision display, MIME/signature/size validation, and public serving limited to banner paths. |
| 3 | Step screen, Python inputs/drafts, theory, files and review feedback | Custom stdin stays browser-local; status comparison only applies to the official open sample; draft storage is keyed by enrollment and step and switches safely between steps; Markdown supports code and HTTPS images with raw HTML disabled; invalid files name formats and configured size; protected previews support PNG/JPG/JPEG/WEBP; every manual decision requires a student-visible comment. |
| 4 | Curator answers close questions | Threads persist; student and curator can append messages. Migration converts previous question/answer text into message rows; API tests cover access boundaries and multiple replies. |
| 5 | Admin cannot remove a course | `DELETE` physically deletes only an unpublished draft; any published course is archived, can be restored, and cannot receive new assignments. History is retained. |
| 6 | Assignment management is enrollment-row based and lacks search | View groups every active student with their courses and curators; separate search controls filter students, courses, and curators; removing a course marks enrollment `removed` without deleting attempts; reassigning reactivates that row. |
| 7 | Admin sets initial password; account deletion missing | Create user without usable password; first-password and reset links are one-time; account delete anonymizes and disables login while preserving references and work history. |
| 8 | Assigning a published course to a new student failed in manual test | Added API regression: create a passwordless student, set password, assign published course/curator, and verify enrollment. Duplicate, inactive, draft and archived cases have explicit server errors. |
| 9 | Footer is absent | Shared footer added to authenticated role layouts. |
| 10 | Section navigation is hidden in a dropdown; logout is not beside the account | Role links are visible in the top navigation; exit icon sits beside account and remains keyboard-accessible. Mobile nav scrolls horizontally. |
| 11 | Student profile and statistics are missing | `/student/profile` shows explainable completed/remaining steps, points, and per-course progress; no invented rank or streak. |

## Implementation and verification log

The feature contains the implementation and relevant unit/API checks. Browser
E2E on imported courses and visual inspection of the live UI on mobile still
belong to release acceptance and are not claimed as complete here.

- Full frontend suite: 88 tests passed; TypeScript and production build passed.
- Full backend suite: 84 tests passed in a temporary isolated virtualenv;
  `manage.py check` and `makemigrations --check --dry-run` passed.
- `docker compose config --quiet` and `git diff --check` passed.
- Brandbook v1.1 reviewed: pages 2, 3, 6, and 7 visually; typography, exact
  palette, role density, status icon/color/label, layout and tone examples
  checked; pages 4–5 text rules were also checked. UI CSS refers to the
  organizer's original `design/brand-tokens.css`; the login uses neutral copy
  because the role is not known before authentication.
- Vite reports the main JS chunk above 500 KB after minification. This is a
  build advisory, not a failed build; a later performance pass can split routes.
