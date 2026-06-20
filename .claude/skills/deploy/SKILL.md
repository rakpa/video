---
name: deploy
description: Push committed work to GitHub and ship it to Vercel for the video repo. Use whenever the user says "deploy", "ship", "push to git and vercel", "publish", or asks to make changes live. Handles committing, pushing the feature branch, and fast-forwarding main (which triggers Vercel's production build).
---

# Deploy (git + Vercel)

Ship the current work to GitHub and Vercel for this repo.

## Account context

- **GitHub username:** `rakpa` (repo: `rakpa/video`)
- **Vercel account email:** `rakpa8@gmail.com`
- **Deploy mechanism (primary):** a **Vercel Deploy Hook**. The hook URL is
  provided via the `VERCEL_DEPLOY_HOOK` environment variable (set in the Claude
  Code web environment settings — never commit it; it is a secret trigger URL).
  REQUIRES `api.vercel.com` to be in the environment's network egress allowlist,
  otherwise the POST fails with 403 "Host not in allowlist". After pushing
  `main`, POST to it to start a production build:
  ```bash
  if [ -n "$VERCEL_DEPLOY_HOOK" ]; then
    curl -fsS -X POST "$VERCEL_DEPLOY_HOOK" && echo "Vercel build triggered"
  else
    echo "VERCEL_DEPLOY_HOOK not set — relying on the GitHub integration; ask the user for the hook URL."
  fi
  ```
- **Deploy mechanism (fallback):** the GitHub integration. `vercel.json` has
  `git.deploymentEnabled.main = true`, so if the repo is connected in Vercel with
  Production Branch = `main`, pushing `main` auto-deploys even without the hook.
- There is **no Vercel CLI or `VERCEL_TOKEN`** in this environment, so a direct
  `vercel deploy` is not possible. (Re-check with `which vercel` /
  `printenv | grep -i vercel`; if a token ever appears, `vercel --prod
  --token=$VERCEL_TOKEN` is an option.)
- The **backend/API runs on Render** (see `render.yaml`), not Vercel. Vercel only
  hosts the React frontend in `client/`. If a change touches `server/`, note that
  it deploys via Render (auto-deploys on `main` push too), not Vercel.

## Procedure

1. **Verify the build before shipping.** From `client/`:
   ```bash
   cd client && (npm run -s typecheck || npx tsc --noEmit) && npm run -s build
   ```
   Do not deploy if typecheck or build fails — report the failure instead.

2. **Commit any pending work** on the current feature branch (the branch the
   session is assigned to, e.g. `claude/...`). Use a clear message and the
   required commit trailers.

3. **Push the feature branch:**
   ```bash
   git push -u origin <feature-branch>
   ```

4. **Fast-forward `main` and push it** (this is what triggers the Vercel build):
   ```bash
   git fetch origin main -q
   git checkout main -q
   git merge --ff-only <feature-branch> -q   # if not ff-only, STOP and ask the user
   git push origin main
   git checkout <feature-branch> -q           # return to the feature branch
   ```
   If `--ff-only` fails (main has diverged), do **not** force anything — surface
   it and ask how to proceed.

5. **Confirm both are in sync:**
   ```bash
   git fetch origin -q
   git rev-parse <feature-branch> origin/<feature-branch> origin/main
   ```
   All three hashes should match.

6. **Trigger Vercel** by POSTing to the deploy hook (see "Deploy mechanism"
   above). If `VERCEL_DEPLOY_HOOK` is unset, tell the user git is pushed but ask
   them for the hook URL (or to fix the GitHub integration) so Vercel can deploy.

7. **Report**: state that git is pushed and whether the Vercel build was
   triggered via the hook. Remind the user the live URL updates once Vercel
   finishes the build (it can't be polled from here without a token). If only
   frontend changed, that's all; if `server/` changed, mention Render redeploys too.

## Notes
- Never create a pull request unless the user explicitly asks.
- On network errors during push, retry up to 4 times with exponential backoff
  (2s, 4s, 8s, 16s).
