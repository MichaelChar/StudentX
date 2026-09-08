/*
  Custom Playwright reporter for issue #439.

  The stock `list` reporter prints a `-` for a skipped test and exits 0, so
  `npm run test:e2e` with no credentials configured looks exactly like a
  clean pass. PR #398's assertions sat unexecuted on main for that reason.

  This prints an explicit coverage line at the end of every run — what ran,
  what did not, and why — so the gap is stated rather than inferred from a
  glyph.

  Set E2E_REQUIRE_ALL=1 to turn any skip into a non-zero exit. Off by
  default: skipping IS the documented way to run a subset locally, and
  e2e/README.md records the deliberate decision not to gate on this suite.
  It is here for whoever eventually wires an advisory CI job (option 3 in
  #439), so they do not have to invent it.
*/

const BAR = '─'.repeat(64);

export default class CoverageReporter {
  constructor() {
    this.passed = [];
    this.failed = [];
    this.skipped = [];
  }

  onTestEnd(test, result) {
    const title = test.titlePath().filter(Boolean).slice(1).join(' › ') || test.title;
    if (result.status === 'skipped') this.skipped.push(title);
    else if (result.status === 'passed') this.passed.push(title);
    else this.failed.push(title);
  }

  onEnd(result) {
    const total = this.passed.length + this.failed.length + this.skipped.length;
    const ran = this.passed.length + this.failed.length;

    const out = [];
    out.push('');
    out.push(BAR);
    out.push(`  e2e coverage: ${ran} of ${total} test(s) actually executed`);

    if (this.skipped.length > 0) {
      out.push('');
      out.push(`  NOT RUN (${this.skipped.length}) — these did not pass, they never executed:`);
      for (const t of this.skipped) out.push(`    - ${t}`);
      out.push('');
      out.push('  Usually missing credentials. To run them, set:');
      out.push('    E2E_STUDENT_EMAIL / E2E_STUDENT_PASSWORD');
      out.push('    E2E_LANDLORD_EMAIL / E2E_LANDLORD_PASSWORD');
      out.push('  and SUPABASE_SERVICE_ROLE_KEY for the app server.');
    }

    if (ran === 0 && total > 0) {
      out.push('');
      out.push('  NOTHING RAN. A zero exit code here means "not tested",');
      out.push('  not "working". See issue #439.');
    }

    out.push(BAR);
    out.push('');
    process.stdout.write(out.join('\n'));

    if (process.env.E2E_REQUIRE_ALL && this.skipped.length > 0) {
      process.stdout.write(
        `E2E_REQUIRE_ALL is set and ${this.skipped.length} test(s) were skipped — failing the run.\n\n`,
      );
      result.status = 'failed';
    }
  }
}
