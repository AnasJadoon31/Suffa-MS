import { Project, SyntaxKind } from "ts-morph";

const bannedNames = new Set(["alert", "confirm", "prompt"]);

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
  skipAddingFilesFromTsConfig: false,
});

const failures = [];

for (const sourceFile of project.getSourceFiles("src/**/*.{ts,tsx}")) {
  sourceFile.forEachDescendant((node) => {
    if (!node.isKind(SyntaxKind.CallExpression)) return;
    const expression = node.getExpression();

    if (expression.isKind(SyntaxKind.PropertyAccessExpression)) {
      const propertyName = expression.getName();
      if (!bannedNames.has(propertyName)) return;
      const owner = expression.getExpression().getText();
      if (owner === "window" || owner === "globalThis") {
        failures.push(`${sourceFile.getFilePath()}:${node.getStartLineNumber()} native ${owner}.${propertyName}()`);
      }
      return;
    }

    if (!expression.isKind(SyntaxKind.Identifier)) return;
    const name = expression.getText();
    if (!bannedNames.has(name)) return;

    const symbol = expression.getSymbol();
    const declarations = symbol?.getDeclarations() ?? [];
    const isLocalDialogBinding = declarations.some((declaration) => {
      if (declaration.getSourceFile().getFilePath() !== sourceFile.getFilePath()) return false;
      return declaration.isKind(SyntaxKind.BindingElement)
        || declaration.isKind(SyntaxKind.VariableDeclaration)
        || declaration.isKind(SyntaxKind.Parameter);
    });
    if (!isLocalDialogBinding) {
      failures.push(`${sourceFile.getFilePath()}:${node.getStartLineNumber()} unbound/global ${name}()`);
    }
  });
}

if (failures.length > 0) {
  console.error("Native browser dialogs are not allowed. Use useDialog() from DialogContext instead:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log("dialog usage audit passed");
