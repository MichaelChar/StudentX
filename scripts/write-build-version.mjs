#!/usr/bin/env node
/*
  Stamp the commit being deployed into public/version.json, so production can
  be asked which build it is serving. Read by scripts/verify-deploy.mjs (the
  post-deploy-verify workflow).

  WHY. Every push to main starts its own Cloudflare Workers Build, and the
  deploy that finishes LAST wins, not the newest commit (2026-10-02: #588 and
  #589 merged, prod stayed on #587, every check green). Without a version
  stamp the only way to tell which build is live was a marker unique to the
  last PR, checked by hand.

  RUNS FIRST ON `cf:build`, before `opennextjs-cloudflare build`, which copies
  public/ into .open-next/assets. It is a static asset, so it is served
  without running the Worker and is no-store via public/_headers.

  The SHA comes from WORKERS_CI_COMMIT_SHA, which Workers Builds injects, and
  falls back to the local HEAD for `npm run deploy` / `preview`. It never
  fails the build: a missing stamp shows up as a red post-deploy check, which
  is the right place to notice it, not a blocked deploy.
*/

import { execSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

function localSha() {
  try {
    return execSync('git rev-parse HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim();
  } catch {
    return null;
  }
}

const version = {
  sha: process.env.WORKERS_CI_COMMIT_SHA || localSha() || 'unknown',
  branch: process.env.WORKERS_CI_BRANCH || null,
  builtAt: new Date().toISOString(),
};

writeFileSync('public/version.json', `${JSON.stringify(version, null, 2)}\n`);
console.log(`✓ public/version.json → ${version.sha}`);
