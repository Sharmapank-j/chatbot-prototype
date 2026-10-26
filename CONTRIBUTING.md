# Contributing

1. Create a feature branch from `indica-anime-us`.
2. Read `docs/AGENTS.md` and the relevant architecture docs.
3. Add tests for behavior changes; keep offline mode strictly offline.
4. Run `npm run type-check`, `npm test`, `npm run lint`, and `npm run build` where applicable.
5. Never commit `.env.local`, credentials, model weights, private comic pages, generated binaries, or user data.
6. Prefer small end-to-end slices with explicit fallback behavior.
7. Include setup/troubleshooting docs when introducing new tools.

## Pull request checklist

- [ ] Scope and acceptance criteria are clear.
- [ ] Offline/no-network behavior has been considered.
- [ ] Upload limits and path validation are in place.
- [ ] New dependencies have licences and maintenance status checked.
- [ ] Tests added and relevant checks run.
- [ ] No unsupported claims, secrets, or private content committed.
