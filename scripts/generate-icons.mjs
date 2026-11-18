import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// 从已确认的圆角透明母版生成尺寸资源，原始方形图案另行保留。
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(root, 'assets/branding/agyflux-rounded-source.png');
const cli = path.join(root, 'node_modules/@tauri-apps/cli/tauri.js');
const staging = path.join(root, '.repair/icon-build');
const icons = path.join(root, 'src-tauri/icons');
const windows = path.join(icons, 'windows');
const sizes = [16, 20, 24, 30, 32, 36, 40, 48, 60, 64, 72, 80, 96, 128, 192, 256];
if (!existsSync(source) || !existsSync(cli)) throw new Error('请先放置图标母版并运行 npm ci。');
for (const directory of [staging, icons, windows]) mkdirSync(directory, { recursive: true });

const generate = (directory, args = []) => execFileSync(process.execPath, [cli, 'icon', source, '--output', path.join(staging, directory), ...args], { cwd: root, stdio: 'inherit' });
generate('desktop');
generate('png', [...sizes, 512, 1024].flatMap((size) => ['--png', String(size)]));

// Tauri 桌面、macOS Dock 和 Windows 商店资源。
for (const name of ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.png', 'icon.icns',
  'Square30x30Logo.png', 'Square44x44Logo.png', 'Square71x71Logo.png', 'Square89x89Logo.png',
  'Square107x107Logo.png', 'Square142x142Logo.png', 'Square150x150Logo.png', 'Square284x284Logo.png',
  'Square310x310Logo.png', 'StoreLogo.png']) {
  copyFileSync(path.join(staging, 'desktop', name), path.join(icons, name));
}
copyFileSync(path.join(staging, 'png/64x64.png'), path.join(icons, '64x64.png'));
for (const size of sizes) copyFileSync(path.join(staging, `png/${size}x${size}.png`), path.join(windows, `${size}x${size}.png`));
copyFileSync(path.join(staging, 'png/1024x1024.png'), path.join(root, 'assets/branding/agyflux-1024.png'));

// 一个 ICO 中封装全部 PNG 图像；Windows 10/11 可按显示位置与缩放比例选取。
const frames = sizes.map((size) => {
  const png = readFileSync(path.join(windows, `${size}x${size}.png`));
  if (!png.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
      || png.readUInt32BE(16) !== size || png.readUInt32BE(20) !== size || png[25] !== 6) {
    throw new Error(`生成的 ${size}px 图标不是预期的 RGBA PNG。`);
  }
  return png;
});
const header = Buffer.alloc(6 + 16 * frames.length);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(frames.length, 4);
let offset = header.length;
for (let index = 0; index < frames.length; index++) {
  const entry = 6 + index * 16;
  header[entry] = header[entry + 1] = sizes[index] === 256 ? 0 : sizes[index];
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(frames[index].length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += frames[index].length;
}
writeFileSync(path.join(icons, 'icon.ico'), Buffer.concat([header, ...frames]));
copyFileSync(path.join(icons, 'icon.ico'), path.join(root, 'public/favicon.ico'));
for (const name of ['src/assets/logo.png', 'public/icon.png', 'public/logo.png']) {
  copyFileSync(path.join(icons, '128x128@2x.png'), path.join(root, name));
}
writeFileSync(path.join(root, 'assets/branding/icon-manifest.json'), `${JSON.stringify({
  name: 'AgyFlux', source: 'agyflux-rounded-source.png', original: 'agyflux-source.png',
  corner_style: 'rounded-square', transparent_corners: true, ico: '../../src-tauri/icons/icon.ico',
  windows_sizes: sizes, color_depth: 32, frame_encoding: 'PNG RGBA',
  generator: 'npm run icons',
}, null, 2)}\n`);
console.log(`AgyFlux 图标已生成，Windows ICO 含 ${sizes.length} 档尺寸：${sizes.join(', ')}。`);
