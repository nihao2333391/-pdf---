const esbuild = require('esbuild');
const fs = require('node:fs');
const path = require('node:path');
async function main() {
  const output = 'miniprogram/vendor/documents.js';
  const result = await esbuild.build({ entryPoints: ['engine/documents.cjs'], outfile: output, bundle: true, platform: 'browser', format: 'cjs', target: 'es2017', minify: true, legalComments: 'eof', metafile: true });
  const bytes = fs.statSync(output).size;
  const packages = ['pdf-lib', 'docxtemplater', 'pizzip', '@xmldom/xmldom', '@pdf-lib/standard-fonts', '@pdf-lib/upng', 'pako', 'tslib'];
  const notices = packages.map(name => {
    const directory = path.join('node_modules', name);
    const pkg = JSON.parse(fs.readFileSync(path.join(directory, 'package.json'), 'utf8'));
    const license = ['LICENSE', 'LICENSE.md', 'LICENSE.txt', 'LICENSE.markdown', 'LICENSE-MIT.txt', 'LICENSE-MIT', 'LICENSE-MIT.md', 'license'].find(file => fs.existsSync(path.join(directory, file)));
    if (!license) throw new Error(`License missing: ${name}`);
    return `${name} ${pkg.version} (${pkg.license})\n${fs.readFileSync(path.join(directory, license), 'utf8')}`;
  });
  for (const nestedPako of ['node_modules/pdf-lib/node_modules/pako', 'node_modules/pizzip/node_modules/pako']) {
    if (fs.existsSync(nestedPako)) notices.push(`${nestedPako}\n${fs.readFileSync(path.join(nestedPako, 'LICENSE'), 'utf8')}`);
  }
  fs.writeFileSync('miniprogram/vendor/LICENSES.txt', notices.join('\n\n--------------------\n\n'));
  fs.mkdirSync('.cache/build', { recursive: true });
  fs.writeFileSync('.cache/build/metafile.json', JSON.stringify(result.metafile, null, 2));
  const files = fs.readdirSync('miniprogram', { recursive: true }).filter(name => fs.statSync(path.join('miniprogram', name)).isFile());
  const total = files.reduce((sum, name) => sum + fs.statSync(path.join('miniprogram', name)).size, 0);
  console.log(`Document bundle: ${(bytes / 1024).toFixed(1)} KiB. Source package: ${(total / 1024).toFixed(1)} KiB.`);
  if (total >= 2 * 1024 * 1024) throw new Error('主包源码已达到 2 MiB，请拆分后再预览。');
}
main().catch(error => { console.error(error); process.exitCode = 1; });
