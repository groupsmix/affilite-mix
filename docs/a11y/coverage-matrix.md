# A11y Coverage Matrix (OF-18)

WCAG 2.2 AA target. Routes covered by `tests/a11y/*.spec.ts`:

- / (home)
- /products
- /products/[slug]
- /quiz
- /checkout
- /account
- /admin (smoke only, requires login)
- /content/* (3 representative articles)

Keyboard regression (`tests/a11y/keyboard.spec.ts`):
- Tab order, Shift+Tab, Esc closes modals
- Focus-visible ring on all interactive elements
- Skip-to-content link first in tab order

Lint:
- `eslint-plugin-jsx-a11y` strict
- `pa11y-ci` against preview deploy
- alt/content lint via `tools/a11y/alt-lint.ts`
