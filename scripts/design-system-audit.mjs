import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const files = [
  'apps/dashboard/app/globals.css',
  'apps/web/app/globals.css',
  'packages/ui/src/powerchain-logo.tsx',
  'apps/dashboard/components/renewable-scene.tsx',
].map((file) => ({ file, text: fs.readFileSync(path.join(root, file), 'utf8') }));

const cssFiles = files.filter(({ file }) => file.endsWith('.css'));
const failures = [];
let checks = 0;
const check = (condition, message) => { checks += 1; if (!condition) failures.push(message); };

const allowedHex = new Set(['#0a0a0a','#ffffff','#f5f5f5','#fafafa','#525252','#737373','#e5e5e5','#0b6b38','#e7000b']);
for (const { file, text } of files) {
  check(!/gradient\(/i.test(text), `${file}: gradients are prohibited`);
  const colors = [...text.matchAll(/#[0-9a-fA-F]{6}\b/g)].map((m) => m[0].toLowerCase());
  for (const color of colors) check(allowedHex.has(color), `${file}: non-canonical color ${color}`);
}

for (const { file, text } of cssFiles) {
  for (const match of text.matchAll(/font-size:\s*(\d+(?:\.\d+)?)px/g)) {
    check(Number(match[1]) >= 14, `${file}: text below 14px (${match[1]}px)`);
  }
  for (const match of text.matchAll(/letter-spacing:\s*(-?\d*\.?\d+)em/g)) {
    const value = Number(match[1]);
    check(value >= -0.05 && value <= 0.05, `${file}: tracking outside ±0.05em (${value}em)`);
  }
  for (const match of text.matchAll(/border-radius:\s*(\d+)px/g)) {
    check(match[1] === '18' || match[1] === '24', `${file}: non-canonical radius ${match[1]}px`);
  }
  check(!/backdrop-filter:\s*blur/i.test(text), `${file}: glass/blur treatment is prohibited`);
}

const dashboard = fs.readFileSync(path.join(root, 'apps/dashboard/app/globals.css'), 'utf8');
const web = fs.readFileSync(path.join(root, 'apps/web/app/globals.css'), 'utf8');
check(/\.primary\{[^}]*background:#0a0a0a!important[^}]*color:#ffffff!important/s.test(dashboard), 'dashboard primary action must use #0a0a0a on #ffffff');
check(/\.primary\{[^}]*background:#0a0a0a[^}]*color:#ffffff/s.test(web), 'web primary action must use #0a0a0a on #ffffff');
check(/font-size:48px!important[^}]*font-weight:600!important[^}]*letter-spacing:-\.05em!important/s.test(dashboard), 'dashboard display typography contract missing');
check(/\.hero h1\{[^}]*font-size:48px[^}]*font-weight:600[^}]*letter-spacing:-\.05em/s.test(web), 'web display typography contract missing');
check(dashboard.includes('border:1px solid #e5e5e5!important'), 'dashboard canonical card hairline missing');
check(dashboard.includes('0 1px 1px rgba(10,10,10,.025),0 1px 2px rgba(10,10,10,.035),0 2px 4px rgba(10,10,10,.025)'), 'dashboard canonical stacked card shadow missing');
check(web.includes('0 1px 1px rgba(10,10,10,.025),0 1px 2px rgba(10,10,10,.035),0 2px 4px rgba(10,10,10,.025)'), 'web canonical stacked card shadow missing');
check(fs.existsSync(path.join(root, 'docs/DESIGN_SYSTEM.md')), 'canonical design-system documentation missing');
check(fs.existsSync(path.join(root, 'packages/ui/src/tokens.ts')), 'shared UI tokens missing');

if (failures.length) {
  console.error(`Design-system audit FAILED (${checks - failures.length}/${checks})`);
  failures.forEach((failure) => console.error(`- ${failure}`));
  process.exit(1);
}
console.log(`Design-system audit PASS (${checks}/${checks})`);
