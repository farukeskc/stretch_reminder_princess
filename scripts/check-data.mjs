// stretches.json / messages.json doğrulaması: node scripts/check-data.mjs
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ANIMS } from '../public/js/figure.js';
import { AREAS } from '../public/js/shared/defaults.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stretches = JSON.parse(await readFile(path.join(root, 'public/data/stretches.json'), 'utf8'));
const messages = JSON.parse(await readFile(path.join(root, 'public/data/messages.json'), 'utf8'));
const areaIds = new Set(AREAS.map((a) => a.id));
const errors = [];
const ids = new Set();

for (const s of stretches) {
  const where = `[${s.id}]`;
  if (!/^[a-z0-9-]+$/.test(s.id)) errors.push(`${where} geçersiz id`);
  if (ids.has(s.id)) errors.push(`${where} tekrar eden id`);
  ids.add(s.id);
  for (const k of ['name', 'summary', 'anim', 'view', 'caution']) if (!s[k]) errors.push(`${where} eksik alan: ${k}`);
  if (!ANIMS[s.anim]) errors.push(`${where} animasyon yok: ${s.anim}`);
  else if (ANIMS[s.anim].view !== s.view) errors.push(`${where} görünüm uyuşmuyor: ${s.view} ≠ ${ANIMS[s.anim].view}`);
  if (!s.areas?.length || s.areas.some((a) => !areaIds.has(a))) errors.push(`${where} geçersiz bölge: ${s.areas}`);
  const sum = (s.steps || []).reduce((a, st) => a + st.sec, 0);
  if (sum !== s.durationSec) errors.push(`${where} adım süreleri toplamı ${sum} ≠ durationSec ${s.durationSec}`);
  if (s.youtube && !/^[\w-]{11}$/.test(s.youtube.id)) errors.push(`${where} YouTube id hatalı`);
}

for (const area of Object.keys(messages.byArea || {})) if (!areaIds.has(area)) errors.push(`messages.byArea bilinmeyen bölge: ${area}`);
for (const t of [...messages.titles, ...messages.generic, ...Object.values(messages.byArea).flat()]) {
  const unknown = [...t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]).filter((k) => !['nick', 'stretch', 'dur'].includes(k));
  if (unknown.length) errors.push(`Mesajda bilinmeyen değişken ${unknown}: "${t}"`);
}

if (errors.length) {
  console.error(errors.map((e) => `❌ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ ${stretches.length} hareket ve ${messages.generic.length + messages.titles.length} mesaj şablonu geçerli.`);
