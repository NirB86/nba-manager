// Finds the main face in every player photo so the game can frame all photos
// the same way (a headshot centred on the eyes), without editing the files.
// Runs face detection (face-api, MIT: Tiny Face Detector, SSD MobileNet v1 as
// fallback, and tiny 68-point landmarks)
// in headless Chromium; images are downloaded by Node and handed over, so the
// browser needs no network access. Results are cached in <cache-dir>/faces.json.
//
//   npm run import:faces -- <cache-dir> <league.json>

import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import type { LeagueFile } from '../../src/engine/types';

export interface FaceFocus {
  /** Eye-line centre, as fractions of image width and height. */
  x: number;
  y: number;
  /** Face width as a fraction of image width. */
  w: number;
  /** Image height / width. */
  aspect: number;
}

const require = createRequire(import.meta.url);
/** Pause between downloads. Wikimedia needs ~1.8 s; set FACES_PACE_MS lower for a CDN. */
const PACE_MS = Number(process.env.FACES_PACE_MS ?? 1800);
const UA = 'nba-manager-import/0.1 (https://github.com/NirB86/nba-manager; personal non-commercial project)';
const MODEL_DIR = join(process.cwd(), 'node_modules/@vladmandic/face-api/model');
const LIB = join(process.cwd(), 'node_modules/@vladmandic/face-api/dist/face-api.js');

async function main() {
  const [cacheDir, leagueFile] = process.argv.slice(2);
  if (!cacheDir || !leagueFile) throw new Error('usage: faces.ts <cache-dir> <league.json>');
  const league = JSON.parse(readFileSync(leagueFile, 'utf8')) as LeagueFile;
  const cachePath = join(cacheDir, 'faces.json');
  const cache: Record<string, FaceFocus | null> = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, 'utf8')) : {};
  const urls = [...new Set([...league.players, ...league.staff].map((p) => p.photo?.url).filter((u): u is string => !!u && !(u in cache)))];
  console.log(`Faces: ${urls.length} photos to analyse (${Object.keys(cache).length} cached)`);
  if (!urls.length) return;

  const { chromium } = require('playwright') as typeof import('playwright');
  const browser = await chromium.launch();
  const page = await browser.newPage();
  const images = new Map<string, Buffer>();
  await page.route('http://local/**', async (route) => {
    const url = new URL(route.request().url());
    if (url.pathname.startsWith('/model/')) {
      const file = join(MODEL_DIR, url.pathname.slice('/model/'.length));
      return route.fulfill({ body: readFileSync(file), contentType: file.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
    }
    const img = images.get(url.pathname.slice(1));
    return img ? route.fulfill({ body: img, contentType: 'image/jpeg' }) : route.fulfill({ status: 404 });
  });
  await page.goto('http://local/index.html').catch(() => undefined);
  await page.setContent('<html><body></body></html>');
  await page.addScriptTag({ path: LIB });
  await page.evaluate(async () => {
    const f = (window as any).faceapi;
    await f.nets.tinyFaceDetector.loadFromUri('http://local/model');
    await f.nets.faceLandmark68TinyNet.loadFromUri('http://local/model');
    await f.nets.ssdMobilenetv1.loadFromUri('http://local/model');
  });

  let found = 0;
  for (const [i, url] of urls.entries()) {
    try {
      if (process.env.DEBUG_FACES) console.log(`  fetch ${i}`);
      let res = await fetch(url, { headers: { "user-agent": UA } });
      for (let attempt = 1; res.status === 429 && attempt <= 3; attempt++) {
        const wait = Math.min(30, Number(res.headers.get('retry-after')) || 10 * attempt);
        await new Promise((r) => setTimeout(r, wait * 1000));
        res = await fetch(url, { headers: { 'user-agent': UA } });
      }
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      images.set(String(i), Buffer.from(await res.arrayBuffer()));
      const timeout = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('timed out')), 20_000));
      const focus = (await Promise.race([timeout, page.evaluate(async (key: string) => {
        const f = (window as any).faceapi;
        const img = new Image();
        img.src = `http://local/${key}`;
        await img.decode();
        // Fast detector first; the slower, more accurate one only when it finds nothing.
        let faces = await f.detectAllFaces(img, new f.TinyFaceDetectorOptions({ inputSize: 416, scoreThreshold: 0.45 })).withFaceLandmarks(true);
        if (!faces.length) faces = await f.detectAllFaces(img, new f.SsdMobilenetv1Options({ minConfidence: 0.45 })).withFaceLandmarks(true);
        if (!faces.length) return null;
        // The biggest face is the subject; others are teammates or fans.
        const main = faces.sort((a: any, b: any) => b.detection.box.width - a.detection.box.width)[0];
        const box = main.detection.box;
        const eyes = [...main.landmarks.getLeftEye(), ...main.landmarks.getRightEye()];
        const ex = eyes.reduce((s: number, p: any) => s + p.x, 0) / eyes.length;
        const ey = eyes.reduce((s: number, p: any) => s + p.y, 0) / eyes.length;
        const W = img.naturalWidth;
        const H = img.naturalHeight;
        return { x: ex / W, y: ey / H, w: box.width / W, aspect: H / W };
      }, String(i))])) as FaceFocus | null;
      images.delete(String(i));
      cache[url] = focus ? { x: +focus.x.toFixed(4), y: +focus.y.toFixed(4), w: +focus.w.toFixed(4), aspect: +focus.aspect.toFixed(4) } : null;
      if (focus) found++;
    } catch (e) {
      console.warn(`  ${url.slice(-60)}: ${(e as Error).message}`);
    }
    if (i % 25 === 24) {
      writeFileSync(cachePath, JSON.stringify(cache));
      console.log(`  ${i + 1}/${urls.length}, faces found: ${found}`);
    }
    await new Promise((r) => setTimeout(r, PACE_MS));
  }
  writeFileSync(cachePath, JSON.stringify(cache));
  await browser.close();
  console.log(`Faces: found in ${found}/${urls.length} new photos`);
}

main().catch((e) => {
  console.error(e instanceof Error ? e.message : e);
  process.exit(1);
});
