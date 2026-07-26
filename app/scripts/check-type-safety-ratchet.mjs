import { Project, SyntaxKind } from "ts-morph";

const BASELINE = Object.freeze({
  anyKeywords: 135,
  asAnyCasts: 1,
  tsSuppressions: 0,
});

const project = new Project({ tsConfigFilePath: "tsconfig.json" });

const totals = {
  anyKeywords: 0,
  asAnyCasts: 0,
  tsSuppressions: 0,
};

const offenders = [];

for (const sourceFile of project.getSourceFiles()) {
  const anyKeywords = sourceFile.getDescendantsOfKind(SyntaxKind.AnyKeyword).length;
  const asAnyCasts = sourceFile
    .getDescendantsOfKind(SyntaxKind.AsExpression)
    .filter((node) => node.getTypeNode()?.getKind() === SyntaxKind.AnyKeyword).length;
  const tsSuppressions = (sourceFile.getFullText().match(/@ts-ignore|@ts-expect-error/g) ?? []).length;

  totals.anyKeywords += anyKeywords;
  totals.asAnyCasts += asAnyCasts;
  totals.tsSuppressions += tsSuppressions;
  if (anyKeywords || asAnyCasts || tsSuppressions) {
    offenders.push({
      file: sourceFile.getFilePath().replace(`${process.cwd()}/`, ""),
      anyKeywords,
      asAnyCasts,
      tsSuppressions,
    });
  }
}

const failures = Object.entries(BASELINE)
  .filter(([key, limit]) => totals[key] > limit)
  .map(([key, limit]) => `${key}: ${totals[key]} > baseline ${limit}`);

if (failures.length > 0) {
  console.error("Type-safety ratchet failed. Reduce unsafe types or lower the baseline intentionally.");
  console.error(failures.join("\n"));
  console.error(JSON.stringify(offenders.filter((entry) => entry.anyKeywords || entry.asAnyCasts || entry.tsSuppressions), null, 2));
  process.exit(1);
}

console.log(
  `type-safety ratchet passed: any=${totals.anyKeywords}/${BASELINE.anyKeywords}, ` +
  `as-any=${totals.asAnyCasts}/${BASELINE.asAnyCasts}, ` +
  `ts-suppressions=${totals.tsSuppressions}/${BASELINE.tsSuppressions}`
);
