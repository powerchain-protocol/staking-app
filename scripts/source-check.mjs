import fs from 'node:fs/promises';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

async function loadTypeScript(){
  try{return (await import('typescript')).default}catch{}
  for(const candidate of [process.env.TYPESCRIPT_FALLBACK,'/usr/local/lib/node_modules/typescript/lib/typescript.js','/opt/nvm/versions/node/v22.16.0/lib/node_modules/typescript/lib/typescript.js'].filter(Boolean)){
    try{return (await import(pathToFileURL(candidate).href)).default}catch{}
  }
  throw new Error('TypeScript is unavailable. Run npm install or set TYPESCRIPT_FALLBACK.');
}
const ts=await loadTypeScript();
const roots=['apps','packages'];
const files=[];
async function walk(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){if(['node_modules','.next'].includes(entry.name))continue;const full=path.join(dir,entry.name);if(entry.isDirectory())await walk(full);else if(/\.(ts|tsx)$/.test(entry.name)&&!entry.name.endsWith('.d.ts'))files.push(full)}}
for(const root of roots)await walk(root);
let failures=0;
for(const file of files){
  const source=await fs.readFile(file,'utf8');
  const out=ts.transpileModule(source,{fileName:file,reportDiagnostics:true,compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext,jsx:ts.JsxEmit.Preserve}});
  const errors=(out.diagnostics??[]).filter(d=>d.category===ts.DiagnosticCategory.Error);
  if(errors.length){failures++;console.error(`\n${file}`);for(const d of errors)console.error(ts.flattenDiagnosticMessageText(d.messageText,'\n'));}
}
if(failures)throw new Error(`${failures} source file(s) have syntax/transpile errors`);
console.log(`Monorepo source check passed: ${files.length} TypeScript files.`);
