// Usage: node scripts/test-motion-entrance-parity.cjs <base-ref> [head-ref]
// Compares static entrance migrations after removing only motion declarations.
// State, handlers, content, layout props, and non-motion imports must match.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const cp = require('node:child_process');
const ts = require('typescript');
const [base, head] = process.argv.slice(2);
assert.ok(base, 'Provide an explicit base revision');
const git = (...args) => cp.execFileSync('git', args, { encoding: 'utf8' });
const paths = git('diff', '--diff-filter=M', '--name-only', base, ...(head ? [head] : []))
  .trim().split('\n').filter(path => path.endsWith('.tsx'));
const protectedFiles = [
  'src/pages/DashboardPage.tsx',
  'src/pages/DashboardPreviewPage.tsx',
  'src/components/ui/rare-ui/gooey-tab-nav.tsx',
];
assert.ok(!paths.some(path => protectedFiles.includes(path)), 'Dashboard navigation changed');

function normalize(text, path) {
  const source = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const result = ts.transform(source, [context => {
    const f = context.factory;
    const name = node => node.name?.text;
    function attributes(attrs, key) {
      const props = attrs.properties.filter(prop =>
        !ts.isJsxAttribute(prop) || !['initial', 'animate', 'transition'].includes(name(prop)));
      if (key) props.push(key);
      if (!props.some(ts.isJsxSpreadAttribute)) props.sort((a, b) => name(a).localeCompare(name(b)));
      return f.updateJsxAttributes(attrs, props);
    }
    function native(tag) {
      return ts.isPropertyAccessExpression(tag) && tag.expression.getText(source) === 'motion'
        ? f.createIdentifier(tag.name.text) : tag;
    }
    function visit(node) {
      if (ts.isImportDeclaration(node) &&
          ['framer-motion', '@/components/transitions/Transition'].includes(node.moduleSpecifier.text)) {
        return undefined;
      }
      if (ts.isJsxElement(node) && node.openingElement.tagName.getText(source) === 'Transition') {
        const props = node.openingElement.attributes.properties;
        assert.ok(props.every(prop => ts.isJsxAttribute(prop) &&
          ['preset', 'delay', 'key'].includes(name(prop))), 'Only static entrance wrappers are supported');
        const children = node.children.filter(child => !ts.isJsxText(child) || child.text.trim());
        assert.equal(children.length, 1, 'Transition must preserve exactly one child');
        let child = ts.visitNode(children[0], visit);
        const key = props.find(prop => name(prop) === 'key');
        if (key && ts.isJsxElement(child)) {
          const open = child.openingElement;
          child = f.updateJsxElement(child,
            f.updateJsxOpeningElement(open, open.tagName, open.typeArguments, attributes(open.attributes, key)),
            child.children, child.closingElement);
        } else if (key && ts.isJsxSelfClosingElement(child)) {
          child = f.updateJsxSelfClosingElement(child, child.tagName, child.typeArguments,
            attributes(child.attributes, key));
        }
        return child;
      }
      node = ts.visitEachChild(node, visit, context);
      if (ts.isJsxOpeningElement(node)) {
        return f.updateJsxOpeningElement(node, native(node.tagName), node.typeArguments, attributes(node.attributes));
      }
      if (ts.isJsxSelfClosingElement(node)) {
        return f.updateJsxSelfClosingElement(node, native(node.tagName), node.typeArguments, attributes(node.attributes));
      }
      if (ts.isJsxClosingElement(node)) return f.updateJsxClosingElement(node, native(node.tagName));
      if (ts.isJsxText(node)) return f.createJsxText(node.text.replace(/\s+/g, ' '));
      return node;
    }
    return node => ts.visitNode(node, visit);
  }]);
  const printed = ts.createPrinter({ removeComments: true }).printFile(result.transformed[0]);
  result.dispose();
  return printed;
}
for (const path of paths) {
  const before = git('show', `${base}:${path}`);
  const after = head ? git('show', `${head}:${path}`) : fs.readFileSync(path, 'utf8');
  assert.equal(normalize(after, path), normalize(before, path), `Non-entrance change in ${path}`);
}
console.log(`Static entrance parity passed for ${paths.length} files; dashboard navigation unchanged.`);
