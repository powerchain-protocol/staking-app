import fs from 'node:fs';import path from 'node:path';
const roots=['apps/dashboard','apps/web'];let checks=0,failures=0;
const fail=(m)=>{failures++;console.error('FAIL ',m)};const pass=(m)=>console.log('PASS ',m);
for(const root of roots){const stack=[root];while(stack.length){const dir=stack.pop();for(const ent of fs.readdirSync(dir,{withFileTypes:true})){const p=path.join(dir,ent.name);if(ent.isDirectory()){if(!['node_modules','.next'].includes(ent.name))stack.push(p);continue}if(!/\.(tsx|ts)$/.test(ent.name))continue;const s=fs.readFileSync(p,'utf8');checks++;
  if(/href\s*=\s*["']#["']/.test(s))fail(`${p}: placeholder href`);
  const buttons=[...s.matchAll(/<button\b([^>]*)>/gis)];for(const b of buttons){const a=b[1];if(!/onClick\s*=|type\s*=\s*["']submit["']|disabled\s*=|disabled\b/.test(a))fail(`${p}: inert button ${b[0].slice(0,120)}`)}
}}
}
checks++;const toast=fs.readFileSync('apps/dashboard/components/ui/toast.tsx','utf8');toast.includes('useEvents')?pass('toast-event-bus-wired'):fail('toast-event-bus-wired');
checks++;const shell=fs.readFileSync('apps/dashboard/components/app-shell.tsx','utf8');shell.includes('dashboardConfig.socialLinks.length')?pass('social-links-config-gated'):fail('social-links-config-gated');
checks++;fs.existsSync('apps/dashboard/app/not-found.tsx')&&fs.existsSync('apps/dashboard/pages/404.tsx')&&fs.existsSync('apps/dashboard/app/error.tsx')&&fs.existsSync('apps/dashboard/components/error-boundary.tsx')?pass('error-surfaces-complete'):fail('error-surfaces-complete');
if(failures){console.error(`\nUI integrity audit failed: ${failures} issue(s)`);process.exit(1)}console.log(`\nUI integrity audit passed: ${checks} checks; no placeholder links or inert buttons found.`);
