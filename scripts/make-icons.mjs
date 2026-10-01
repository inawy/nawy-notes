// يولّد كل الأيقونات من assets/logo-source.png.
// التشغيل: npm i -D sharp && npm run icons   (يكتب إلى public/)
import sharp from 'sharp';
import { writeFileSync, rmSync, existsSync } from 'node:fs';

const SRC = 'assets/logo-source.png';

// 1) قصّ الحواف الشفافة، ثم لون الخلفية من داخل الأيقونة (ليس من الحافة)
const trimmed = await sharp(SRC).trim({ threshold: 10 }).toBuffer({ resolveWithObject: true });
const { width: tw, height: th } = trimmed.info;
const px = await sharp(trimmed.data).extract({ left: Math.round(tw * 0.12), top: Math.round(th * 0.5), width: 1, height: 1 }).raw().toBuffer();
const BLUE = { r: px[0], g: px[1], b: px[2], alpha: 1 };
console.log('background', BLUE);

// 2) مربع كامل بلون الشعار، الشعار في الوسط (الفرق بين الأبعاد يملؤه نفس اللون)
const SIDE = 1024;
// نقصّ 8% من كل جهة لإزالة الحافة شبه الشفافة للشعار الأصلي (تظهر كحلقة خافتة)؛ الخلفية الزرقاء تعوّضها.
const M = 0.08;
const core = await sharp(trimmed.data)
  .extract({ left: Math.round(tw * M), top: Math.round(th * M), width: Math.round(tw * (1 - 2 * M)), height: Math.round(th * (1 - 2 * M)) })
  .toBuffer();
async function base(scale = 1) {
  const inner = Math.round(SIDE * scale * (1 - 2 * M));
  const logo = await sharp(core).resize(inner, inner, { fit: 'contain', background: BLUE }).toBuffer();
  return sharp({ create: { width: SIDE, height: SIDE, channels: 4, background: BLUE } })
    .composite([{ input: logo, gravity: 'center' }])
    .png()
    .toBuffer();
}
const full = await base(1.0); // يملأ الإطار (iOS يقصّه بنفسه)
const safe = await base(0.74); // منطقة آمنة لـ maskable (80% من القطر)

// 3) زوايا مستديرة للأيقونات العادية (الحافة ملساء بدل الزوايا القاسية)
const round = async (buf, size, r = 0.225) => {
  const mask = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}"><rect width="${size}" height="${size}" rx="${size * r}" fill="#fff"/></svg>`);
  return sharp(buf).resize(size, size).composite([{ input: mask, blend: 'dest-in' }]).png().toBuffer();
};
const solid = (buf, size) => sharp(buf).resize(size, size).png().toBuffer();

const out = (name, buf) => { writeFileSync(`public/${name}`, buf); console.log('wrote', name, buf.length); };
out('pwa-192.png', await round(full, 192));
out('pwa-512.png', await round(full, 512));
out('pwa-maskable-512.png', await solid(safe, 512));
out('apple-touch-icon.png', await solid(full, 180));
out('logo.png', await round(full, 128)); // شعار الواجهة
out('favicon-32.png', await round(full, 32));

// 4) favicon.ico (PNG داخل ICO: مدعوم في كل المتصفحات الحديثة)
const sizes = [16, 32, 48];
const pngs = await Promise.all(sizes.map((s) => round(full, s, 0.2)));
const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
let offset = 6 + 16 * sizes.length;
const dir = sizes.map((s, i) => {
  const e = Buffer.alloc(16);
  e[0] = s; e[1] = s; e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
  e.writeUInt32LE(pngs[i].length, 8); e.writeUInt32LE(offset, 12);
  offset += pngs[i].length;
  return e;
});
out('favicon.ico', Buffer.concat([head, ...dir, ...pngs]));

if (existsSync('public/favicon.svg')) rmSync('public/favicon.svg'); // كان حرف "ن" المؤقت
