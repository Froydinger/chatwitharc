import assert from 'node:assert/strict';
import path from 'node:path';
import ts from 'typescript';

// Use the real application compiler configuration and dependency graph. Root
// `tsc --noEmit` alone has an empty files list and is not a meaningful check.
const root = new URL('../', import.meta.url).pathname;
const configPath = path.join(root, 'tsconfig.app.json');
const config = ts.readConfigFile(configPath, ts.sys.readFile);
assert.equal(config.error, undefined);
const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, root);
const program = ts.createProgram(parsed.fileNames, parsed.options);
const touched = new Set([
  'src/components/ChatRowActions.tsx',
  'src/components/MobileChatApp.tsx',
  'src/components/SmartSuggestions.tsx',
  'src/components/WorkspaceChatWelcome.tsx',
  'src/workspace/WorkspaceChrome.tsx',
  'src/workspace/WorkspaceShell.tsx',
  'src/workspace/workspacePrompts.ts',
].map(file => path.join(root, file)));
const diagnostics = ts.getPreEmitDiagnostics(program);
const scoped = diagnostics.filter(diagnostic => diagnostic.file && touched.has(path.resolve(diagnostic.file.fileName)));
console.log(`TypeScript checked ${program.getSourceFiles().length} source/dependency files: ${scoped.length} diagnostics in ${touched.size} chat-correction files; ${diagnostics.length} repository-wide diagnostics. This is a scoped check, not a whole-repository pass.`);
if (scoped.length) {
  console.error(ts.formatDiagnosticsWithColorAndContext(scoped, { getCanonicalFileName: file => file, getCurrentDirectory: () => root, getNewLine: () => '\n' }));
  process.exitCode = 1;
}
