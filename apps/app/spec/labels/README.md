# Owner labels

`<rubric>.jsonl` contains owner thumbs, never generated calibration labels.
Each line has journey, zero-based step, mode, revision, thumb, assertions, by and
at. An assertion carries rubric, rubricVersion, model, identity, verdict,
trials (3), passes and optional seededDefect. A split verdict is uncertain.
Latest owner label per identity wins; old versions and models do not promote.

Run `bun apps/app/spec/agreementCli.ts` from the repository root. Until Will
labels at least 20 distinct observations and seeded defects, all rubrics remain
advisory. Authored eval cases live separately under evals/fixtures.
