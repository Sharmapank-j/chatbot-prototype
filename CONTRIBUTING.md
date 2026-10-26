# Contributing

1. Branch from `indica-anime-us`.
2. Read `docs/AGENTS.md` and the relevant architecture docs.
3. Add tests for behavior changes; offline mode must stay truly offline.
4. Run typecheck, lint, tests and build where applicable; report checks not run.
5. Never commit secrets, model weights, generated binaries, private comics or user data.
6. Use small end-to-end slices with explicit fallback behavior.
7. Update setup/troubleshooting docs for new external tools.

## PR checklist
- [ ] Acceptance criteria and scope are clear.
- [ ] Offline/network behavior is documented and tested.
- [ ] Upload limits and path validation are in place.
- [ ] Dependency/model licences checked.
- [ ] Tests pass or failures are explained.
- [ ] No credentials or user media committed.
