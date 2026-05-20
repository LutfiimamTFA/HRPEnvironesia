const fs = require('fs');
const ts = require('typescript');
const path = 'd:/HRPEnvironesia/src/components/dashboard/StrukturOrganisasiClient.tsx';
const source = fs.readFileSync(path, 'utf8');
const sourceFile = ts.createSourceFile(path, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const diagnostics = sourceFile.parseDiagnostics;
console.log('diagnostics', diagnostics.length);
for (const d of diagnostics) {
  console.log('message:', d.messageText);
  console.log('start:', d.start, 'length:', d.length);
  const { line, character } = sourceFile.getLineAndCharacterOfPosition(d.start || 0);
  console.log('line:', line+1, 'char:', character+1, 'code:', d.code);
}
