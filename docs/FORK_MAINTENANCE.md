# Fork Maintenance

This note is for maintainers of `ima2-genX`, not for normal installation or npm users.

`ima2-genX` remains a fork to preserve credit and make comparison with [`lidge-jun/ima2-gen`](https://github.com/lidge-jun/ima2-gen) possible, but it is not intended to stay feature-identical. Treat upstream changes as candidates to review, not as automatic updates.

## Suggested Remotes

Keep the original project as `upstream` and this fork as `origin`:

```bash
git remote rename origin upstream
git remote add origin https://github.com/damagethundercat/ima2-gen.git
git fetch --all --prune
```

## Syncing Upstream

When an upstream change is useful, merge intentionally and keep the merge visible:

```bash
git fetch upstream
git switch main
git merge upstream/main
npm run typecheck
npm test
```

Prefer merge commits for upstream syncs so the `ima2-genX`-specific history remains auditable.
