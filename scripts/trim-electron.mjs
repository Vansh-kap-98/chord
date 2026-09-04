/**
 * electron-builder `afterPack` hook: deletes Electron payload this app can
 * never reach.
 *
 * Chord's window is plain DOM and CSS -- there is no canvas, no WebGL, no
 * WebGPU, no <video> or <audio> anywhere in src/ -- so the shader-compilation
 * toolchain Chromium ships for 3D content is dead weight in every build.
 *
 * Deliberately NOT removed, though each is a tempting size win:
 *
 *   vk_swiftshader.dll, vulkan-1.dll  (~6 MB)  the software rasteriser. It is
 *     what draws the window on machines with no usable GPU -- RDP sessions,
 *     VMs, stale or broken drivers. Trading a blank window on someone's
 *     machine for 6 MB is a bad deal for a utility installed on hardware we
 *     never get to see.
 *   d3dcompiler_47.dll                (~5 MB)  ANGLE's HLSL compiler, which
 *     sits under Chromium's ordinary 2D compositing, not just 3D content.
 *   LICENSES.chromium.html            (~20 MB) the attribution text for
 *     Chromium's bundled open-source code. Several of those licences require
 *     it to ship with the binary, so this one is an obligation rather than a
 *     choice. It is plain HTML and compresses to a fraction of its size in
 *     the installer.
 *
 * Locale trimming is not done here: `electronLanguages` in
 * electron-builder.yml handles it, and doing it in one place is better than
 * two.
 */
import { readdir, rm, stat } from 'node:fs/promises';
import { join } from 'node:path';

/**
 * DirectX shader compilation, reached only through WebGPU/Dawn. Removing it
 * costs this app nothing; a build that later grows 3D content would see
 * WebGPU quietly unavailable, hence the note in the file header.
 */
const REMOVE = ['dxcompiler.dll', 'dxil.dll'];

function mb(bytes) {
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export default async function trimElectron(context) {
  // Windows is the only target, but the hook receives every platform's pack.
  if (context.electronPlatformName !== 'win32') return;

  const dir = context.appOutDir;
  const present = new Set(await readdir(dir));
  let freed = 0;
  const removed = [];

  for (const name of REMOVE) {
    // A future Electron may drop or rename these. Missing is fine and must
    // not fail the build; silently keeping one would only cost size.
    if (!present.has(name)) continue;
    const { size } = await stat(join(dir, name));
    await rm(join(dir, name), { force: true });
    freed += size;
    removed.push(`${name} (${mb(size)})`);
  }

  if (removed.length) {
    console.log(`  • trimmed unused Electron payload  freed=${mb(freed)} files=${removed.join(', ')}`);
  }
}
