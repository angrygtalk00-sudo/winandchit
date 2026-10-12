const fs = require('fs');
const path = require('path');

function repair(folder) {
  if (!fs.existsSync(folder)) return;
  const files = fs.readdirSync(folder);
  for (const f of files) {
    if (/\.png\.png$/i.test(f)) {
      const from = path.join(folder, f);
      const to = path.join(folder, f.replace(/\.png\.png$/i, '.png'));
      try {
        fs.renameSync(from, to);
        console.log('Renamed', from, '->', to);
      } catch (e) {
        console.error('Failed to rename', from, e.message);
      }
    }
  }
}

const repoRoot = path.join(__dirname, '..');
const backendAssets = path.join(repoRoot, 'backend', 'public', 'assets');
const frontendAssets = path.join(repoRoot, 'frontend', 'public', 'assets');

repair(backendAssets);
repair(frontendAssets);

console.log('Done');
