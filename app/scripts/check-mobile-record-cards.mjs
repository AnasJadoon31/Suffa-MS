import { Project, SyntaxKind } from "ts-morph";
import fs from "node:fs";

const project = new Project({
  tsConfigFilePath: "tsconfig.json",
  skipAddingFilesFromTsConfig: true,
});

project.addSourceFilesAtPaths("src/**/*.tsx");

const issues = [];
const dataTableSource = fs.readFileSync("src/components/ui/DataTable.tsx", "utf8");

function getAttr(node, name) {
  if (typeof node.getOpeningElement === "function") return node.getOpeningElement().getAttribute(name);
  return node.getAttribute(name);
}

function attrText(node, name) {
  return getAttr(node, name)?.getText() ?? "";
}

function hasClass(node, className) {
  const text = attrText(node, "className");
  return new RegExp(`(^|[^A-Za-z0-9_-])${className}([^A-Za-z0-9_-]|$)`).test(text);
}

function hasDataTableHeader(table) {
  return table.getDescendantsOfKind(SyntaxKind.JsxElement).some((child) => hasClass(child, "dataRow") && hasClass(child, "header"));
}

function nearestDataTable(node) {
  let current = node.getParent();
  while (current) {
    if (current.getKind() === SyntaxKind.JsxElement && hasClass(current, "dataTable")) return current;
    current = current.getParent();
  }
  return undefined;
}

function nearestSheetTable(node) {
  let current = node.getParent();
  while (current) {
    if (current.getKind() === SyntaxKind.JsxElement) {
      const tagName = current.getOpeningElement().getTagNameNode().getText();
      if (tagName === "table" && hasClass(current, "sheet")) return current;
    }
    current = current.getParent();
  }
  return undefined;
}

function hasAncestorClass(node, className) {
  let current = node.getParent();
  while (current) {
    if (current.getKind() === SyntaxKind.JsxElement && hasClass(current, className)) return true;
    current = current.getParent();
  }
  return false;
}

function isMatrixException(node) {
  return hasClass(node, "matrixResponsiveException") || hasAncestorClass(node, "matrixResponsiveException");
}

function hasNonEmptyContent(node) {
  return node.getJsxChildren().some((child) => {
    if (child.getKind() === SyntaxKind.JsxText) return child.getText().trim().length > 0;
    if (child.getKind() === SyntaxKind.JsxExpression) {
      const expression = child.getExpression();
      return Boolean(expression && expression.getText().trim() && expression.getText().trim() !== "undefined");
    }
    return true;
  });
}

function hasVisibleTextContent(node) {
  if (typeof node.getJsxChildren !== "function") return false;
  return node.getJsxChildren().some((child) => {
    if (child.getKind() === SyntaxKind.JsxText) return child.getText().trim().length > 0;
    if (child.getKind() !== SyntaxKind.JsxExpression) return false;
    const expression = child.getExpression();
    if (!expression) return false;
    const text = expression.getText().trim();
    return Boolean(text && !text.startsWith("<") && !/^\w+\s*:\s*/.test(text));
  });
}

function location(node) {
  const sourceFile = node.getSourceFile();
  const { line, column } = sourceFile.getLineAndColumnAtPos(node.getStart());
  return `${sourceFile.getFilePath().replace(`${process.cwd()}/`, "")}:${line}:${column}`;
}

function relativeFile(node) {
  return node.getSourceFile().getFilePath().replace(`${process.cwd()}/`, "");
}

function tagNameOf(node) {
  if (typeof node.getOpeningElement === "function") return node.getOpeningElement().getTagNameNode().getText();
  return node.getTagNameNode().getText();
}

function auditElementPrimitive(node) {
  const tagName = tagNameOf(node);
  const filePath = relativeFile(node);
  const isPrimitiveImplementation = filePath === "src/components/ui/Field.tsx" || filePath === "src/components/ui/PhoneInput.tsx";
  const style = attrText(node, "style");
  if (!isPrimitiveImplementation && hasClass(node, "checkboxLabel")) {
    issues.push(`${location(node)} hand-built checkboxLabel bypasses shared CheckboxField/RadioField`);
  }
  if (!isPrimitiveImplementation && tagName === "Checkbox") {
    issues.push(`${location(node)} direct Checkbox usage must go through shared CheckboxField`);
  }
  if (!isPrimitiveImplementation && tagName === "Radio") {
    issues.push(`${location(node)} direct Radio usage must go through shared RadioField`);
  }
  if (/gridTemplateColumns/.test(style) && !hasClass(node, "timetableGrid") && !/24px\s+minmax\(0,\s*1fr\)/.test(style)) {
    issues.push(`${location(node)} inline gridTemplateColumns bypasses mobile-first CSS`);
  }
  if (!isPrimitiveImplementation && tagName === "select") {
    issues.push(`${location(node)} raw select bypasses shared Select component`);
  }
  if (!isPrimitiveImplementation && tagName === "textarea") {
    issues.push(`${location(node)} raw textarea bypasses shared Textarea component`);
  }
  const type = attrText(node, "type");
  if (isPrimitiveImplementation || tagName !== "input") return;
  if (/checkbox/i.test(type)) {
    issues.push(`${location(node)} raw checkbox input bypasses shared Checkbox component`);
    return;
  }
  if (/radio/i.test(type)) {
    issues.push(`${location(node)} raw radio input bypasses shared Radio component`);
    return;
  }
  issues.push(`${location(node)} raw input bypasses shared Input component`);
}

function auditActionName(node) {
  const tagName = tagNameOf(node);
  if (!["Button", "IconButton", "button"].includes(tagName)) return;
  const className = attrText(node, "className");
  const looksLikeIconAction = tagName === "IconButton" || /\b(iconBtn|iconButton|tableAction|actionMenuTrigger)\b/.test(className);
  if (!looksLikeIconAction || hasVisibleTextContent(node)) return;
  if (getAttr(node, "aria-label")) return;
  issues.push(`${location(node)} icon-only action is missing aria-label`);
}

function auditTableSurface(node) {
  const tagName = tagNameOf(node);
  const filePath = relativeFile(node);
  if (tagName === "Table") {
    if (isMatrixException(node)) return;
    if (filePath !== "src/components/ui/DataTable.tsx") {
      issues.push(`${location(node)} MUI Table must be rendered through shared DataTable`);
      return;
    }
    if (!hasClass(node, "desktopDataTable")) {
      issues.push(`${location(node)} shared DataTable table must be desktopDataTable`);
    }
    if (!node.getSourceFile().getFullText().includes("mobileDataCards")) {
      issues.push(`${location(node)} shared DataTable table is missing paired mobileDataCards renderer`);
    }
    return;
  }
  if (tagName !== "table") return;
  if (isMatrixException(node)) return;
  if (!hasAncestorClass(node, "desktopOnlySheet")) {
    issues.push(`${location(node)} raw table must be wrapped in desktopOnlySheet and paired with mobile cards`);
  }
  if (!node.getSourceFile().getFullText().includes("assessmentMobileList")) {
    issues.push(`${location(node)} raw table has no explicit mobile card list in this module`);
  }
}

if (!/PWA_COMPACT_BREAKPOINT/.test(dataTableSource) || !/max-width:\s*\$\{PWA_COMPACT_BREAKPOINT - 1\}px/.test(dataTableSource)) {
  issues.push("src/components/ui/DataTable.tsx must switch to mobile cards below the shared compact breakpoint");
}

if (!/\bdesktopDataTable\b/.test(dataTableSource) || !/\bmobileDataCards\b/.test(dataTableSource) || !/\bmobileDataCard\b/.test(dataTableSource)) {
  issues.push("src/components/ui/DataTable.tsx must keep desktopDataTable/mobileDataCards/mobileDataCard verification hooks");
}

for (const sourceFile of project.getSourceFiles()) {
  for (const element of sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement)) {
    auditElementPrimitive(element);
    auditActionName(element);
    auditTableSurface(element);
  }

  for (const element of sourceFile.getDescendantsOfKind(SyntaxKind.JsxSelfClosingElement)) {
    auditElementPrimitive(element);
  }

  for (const row of sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement)) {
    const tagName = row.getOpeningElement().getTagNameNode().getText();
    if (tagName !== "div" || !hasClass(row, "dataRow") || hasClass(row, "header") || hasClass(row, "sectionRow")) continue;

    const table = nearestDataTable(row);
    if (!table || !hasDataTableHeader(table)) continue;

    const style = attrText(row, "style");
    if (/display\s*:\s*["']grid["']|gridTemplateColumns/.test(style)) {
      issues.push(`${location(row)} dataRow uses inline desktop grid style inside dataTable`);
    }

    for (const child of row.getJsxChildren()) {
      if (child.getKind() !== SyntaxKind.JsxElement) continue;
      const childTag = child.getOpeningElement().getTagNameNode().getText();
      if (!["span", "div"].includes(childTag)) continue;
      if (!hasNonEmptyContent(child)) continue;
      if (!getAttr(child, "data-label")) {
        issues.push(`${location(child)} mobile data card field is missing data-label`);
      }
    }
  }

  for (const cell of sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement)) {
    const tagName = cell.getOpeningElement().getTagNameNode().getText();
    if (tagName !== "td" || !nearestSheetTable(cell)) continue;
    if (getAttr(cell, "colSpan") || hasClass(cell, "sheetEmpty")) continue;
    if (!hasNonEmptyContent(cell)) continue;
    if (!getAttr(cell, "data-label")) {
      issues.push(`${location(cell)} mobile sheet card field is missing data-label`);
    }
  }
}

if (issues.length) {
  console.error(`mobile record card audit failed:\n${issues.join("\n")}`);
  process.exit(1);
}

console.log("mobile record card audit passed");
