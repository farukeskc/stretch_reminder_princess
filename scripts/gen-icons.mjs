// İkonları üretir: node scripts/gen-icons.mjs  (devDependency: sharp)
// Çıktılar public/icons/ altına yazılır ve repoya commit'lenir.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'public', 'icons');

const GRAD = `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#ffc7dc"/><stop offset="0.55" stop-color="#f48fb1"/><stop offset="1" stop-color="#d9467e"/></linearGradient></defs>`;

const CROWN = `
  <path d="M140 338 L122 186 L200 248 L256 156 L312 248 L390 186 L372 338 Z" fill="#fff" stroke="#fff" stroke-width="22" stroke-linejoin="round"/>
  <rect x="134" y="356" width="244" height="40" rx="20" fill="#fff"/>
  <circle cx="122" cy="178" r="22" fill="#ffd966"/>
  <circle cx="256" cy="146" r="24" fill="#ffd966"/>
  <circle cx="390" cy="178" r="22" fill="#ffd966"/>
  <path d="M256 322 C220 300 204 278 210 258 C215 241 236 236 256 254 C276 236 297 241 302 258 C308 278 292 300 256 322 Z" fill="#e5528a"/>`;

/** rounded: favicon için köşeli/yuvarlak; scale: maskable güvenli alan için içerik ölçeği. */
function iconSvg({ rounded = false, scale = 1 } = {}) {
  const t = (512 * (1 - scale)) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">${GRAD}
  <rect width="512" height="512" ${rounded ? 'rx="112"' : ''} fill="url(#g)"/>
  <g transform="translate(${t} ${t + 8 * scale}) scale(${scale})">${CROWN}</g>
</svg>`;
}

const BADGE = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">
  <path d="M140 338 L122 186 L200 248 L256 156 L312 248 L390 186 L372 338 Z" fill="#fff" stroke="#fff" stroke-width="22" stroke-linejoin="round"/>
  <rect x="134" y="356" width="244" height="40" rx="20" fill="#fff"/>
</svg>`;

await mkdir(out, { recursive: true });
await writeFile(path.join(out, 'icon.svg'), iconSvg({ rounded: true }));

const png = (svg, size, file) =>
  sharp(Buffer.from(svg), { density: 300 }).resize(size, size).png({ compressionLevel: 9 }).toFile(path.join(out, file));

await Promise.all([
  png(iconSvg(), 180, 'apple-touch-icon.png'),
  png(iconSvg(), 192, 'icon-192.png'),
  png(iconSvg(), 512, 'icon-512.png'),
  png(iconSvg({ scale: 0.72 }), 512, 'icon-maskable-512.png'),
  png(BADGE, 72, 'badge-72.png'),
]);
console.log('İkonlar üretildi →', path.relative(root, out));
