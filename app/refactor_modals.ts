import { Project, SyntaxKind, JsxElement, JsxExpression, StringLiteral } from 'ts-morph';

const project = new Project({
  tsConfigFilePath: 'tsconfig.json',
});

project.addSourceFilesAtPaths('src/components/**/*.tsx');

let updatedFiles = 0;

for (const sourceFile of project.getSourceFiles()) {
  let changed = false;

  // We need to iterate from bottom to top so that replacing a node doesn't invalidate subsequent nodes' positions.
  const modals = sourceFile.getDescendantsOfKind(SyntaxKind.JsxElement)
    .filter(node => node.getOpeningElement().getTagNameNode().getText() === 'Modal')
    .reverse();

  for (const modal of modals) {
    // Find the inlineForm
    const form = modal.getJsxChildren().find(child => {
      if (child.getKind() === SyntaxKind.JsxElement) {
        const c = child as JsxElement;
        if (c.getOpeningElement().getTagNameNode().getText() === 'form') {
          const classNameProp = c.getOpeningElement().getAttribute('className');
          if (classNameProp && classNameProp.getKind() === SyntaxKind.JsxAttribute) {
            const init = classNameProp.getInitializer();
            if (init && init.getKind() === SyntaxKind.StringLiteral && init.getText() === '"inlineForm"') {
              return true;
            }
          }
        }
      }
      return false;
    }) as JsxElement | undefined;

    if (!form) continue;

    // Get Modal attributes
    const modalProps = modal.getOpeningElement().getAttributes().map(a => a.getText()).join(' ');

    // Get form onSubmit
    const onSubmitAttr = form.getOpeningElement().getAttribute('onSubmit');
    const onSubmitText = onSubmitAttr ? onSubmitAttr.getText() : '';

    // Get inner content of the form
    const formChildren = form.getJsxChildren();
    
    // Find formActions div
    const formActionsIndex = formChildren.findIndex(child => {
      if (child.getKind() === SyntaxKind.JsxElement) {
        const c = child as JsxElement;
        if (c.getOpeningElement().getTagNameNode().getText() === 'div') {
          const cls = c.getOpeningElement().getAttribute('className');
          if (cls && cls.getText().includes('"formActions"')) return true;
        }
      }
      return false;
    });

    if (formActionsIndex === -1) continue;

    const formActionsDiv = formChildren[formActionsIndex] as JsxElement;
    
    // Find Button inside formActions
    const submitBtn = formActionsDiv.getDescendantsOfKind(SyntaxKind.JsxElement).find(c => {
      if (c.getOpeningElement().getTagNameNode().getText() === 'Button') {
        const typeProp = c.getOpeningElement().getAttribute('type');
        if (typeProp && typeProp.getText().includes('"submit"')) return true;
      }
      return false;
    });

    if (!submitBtn) continue;

    const disabledAttr = submitBtn.getOpeningElement().getAttribute('disabled');
    const disabledText = disabledAttr ? `submitDisabled={${disabledAttr.getInitializer()?.getText()}}` : '';

    // Extract icon and label from button children
    const btnChildren = submitBtn.getJsxChildren();
    let iconText = '';
    let labelText = '';
    
    for (const child of btnChildren) {
      if (child.getKind() === SyntaxKind.JsxSelfClosingElement) {
        iconText = `submitIcon={<${child.getText().replace(/<|>/g, '')} />}`;
      } else if (child.getKind() === SyntaxKind.JsxExpression) {
        labelText = `submitLabel={${(child as JsxExpression).getExpression()?.getText()}}`;
      } else if (child.getKind() === SyntaxKind.JsxText) {
        const text = child.getText().trim();
        if (text) {
          labelText = `submitLabel="${text}"`;
        }
      }
    }

    // Now gather all children EXCEPT formActions and the error message
    let innerContentText = '';
    let errorProp = '';
    
    for (let i = 0; i < formChildren.length; i++) {
      if (i === formActionsIndex) continue; // skip formActions
      
      const child = formChildren[i];
      const text = child.getText();
      
      // Basic check for error message block
      if (text.includes('className="notice"') && text.includes('{error}')) {
        errorProp = 'error={error}';
        continue;
      }
      
      innerContentText += text + '\n';
    }

    // Reconstruct as FormModal
    const props = [modalProps, onSubmitText, labelText, iconText, disabledText, errorProp]
      .filter(p => p.trim() !== '')
      .join('\n  ');

    const newJsx = `<FormModal\n  ${props}\n>\n  ${innerContentText.trim()}\n</FormModal>`;
    
    modal.replaceWithText(newJsx);
    changed = true;
  }

  if (changed) {
    // Add import
    const importDecl = sourceFile.getImportDeclaration(decl => {
      return decl.getModuleSpecifierValue().includes('ui/Modal');
    });
    
    if (importDecl) {
      const namedImports = importDecl.getNamedImports();
      if (!namedImports.some(n => n.getName() === 'FormModal')) {
        importDecl.addNamedImport('FormModal');
      }
    }

    sourceFile.saveSync();
    console.log(`Updated ${sourceFile.getFilePath()}`);
    updatedFiles++;
  }
}

console.log(`Successfully updated ${updatedFiles} files.`);
