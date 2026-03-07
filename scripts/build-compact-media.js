const fs = require('fs');
const path = require('path');

const metadataPath = path.join(__dirname, '..', 'test', 'data', 'metadata.json');
const outDir = path.join(__dirname, '..', 'src', 'public', 'data');

console.log('Reading metadata...');
const raw = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
const records = raw.records;
console.log(`Total records: ${records.length}`);

const TYPES = ['image', 'sfx'];

// Group by source
const groups = {};
for (const r of records) {
  const key = r.source;
  if (!groups[key]) groups[key] = [];
  groups[key].push({
    i: r.id,
    t: TYPES.indexOf(r.type),
    u: r.thumbnailUrl || r.url,
    U: r.url,
    n: r.title,
    g: r.tags.slice(0, 3),
    f: r.format || ''
  });
}

fs.mkdirSync(outDir, { recursive: true });

let totalSize = 0;
for (const [source, items] of Object.entries(groups)) {
  const filename = `media-${source.replace('_', '-')}.json`;
  const json = JSON.stringify(items);
  fs.writeFileSync(path.join(outDir, filename), json);
  totalSize += json.length;
  console.log(`  ${source}: ${items.length} records (${(json.length / 1024 / 1024).toFixed(2)}MB)`);
}

console.log(`\nTotal: ${records.length} records (${(totalSize / 1024 / 1024).toFixed(2)}MB)`);
console.log('Done!');
