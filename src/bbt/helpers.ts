import { readFileSync, writeFileSync } from 'fs';
import path from 'path';
import { Database, ZoteroConnectorSettings } from 'src/types';

// @ts-ignore — loaded as Uint8Array by esbuild's binary loader
import avifEncWasm from '@jsquash/avif/codec/enc/avif_enc.wasm';
import avifEncFactory from '@jsquash/avif/codec/enc/avif_enc.js';
import { defaultOptions as avifDefaultOptions } from '@jsquash/avif/meta.js';
import { initEmscriptenModule } from '@jsquash/avif/utils.js';

let avifEncoderPromise: Promise<any> | null = null;

function getAvifEncoder(): Promise<any> {
  if (!avifEncoderPromise) {
    avifEncoderPromise = WebAssembly.compile(
      avifEncWasm as unknown as BufferSource
    ).then((wasmModule) => initEmscriptenModule(avifEncFactory, wasmModule));
  }
  return avifEncoderPromise;
}

export function getImageQuality(settings: ZoteroConnectorSettings): number {
  switch (settings.pdfExportImageFormat) {
    case 'webp':
      return settings.pdfExportImageQualityWebp ?? 80;
    case 'avif':
      return settings.pdfExportImageQualityAvif ?? 50;
    default:
      return settings.pdfExportImageQuality ?? 90; // jpg
  }
}

export const defaultHeaders = {
  'Content-Type': 'application/json',
  'User-Agent': 'obsidian/zotero',
  Accept: 'application/json',
  Connection: 'keep-alive',
};

export function getPort(database: Database, port?: string) {
  if (database === 'Zotero') return '23119';
  if (database === 'Juris-M') return '24119';
  if (!port) return '23119';
  return port;
}

export async function mkMDDir(mdPath: string) {
  const dir = path.dirname(mdPath);

  if (await app.vault.adapter.exists(dir)) return;

  await app.vault.createFolder(dir);
}

export function replaceIllegalChars(str: string) {
  return str
    .replace(/\s*[*?]+\s*/g, ' ')
    .trim()
    .replace(/\s*[:"<>|]+\s*/g, ' - ')
    .trim();
}

export function sanitizeFilePath(filePath: string) {
  const parsed = path.parse(filePath);
  const dir = replaceIllegalChars(parsed.dir);
  const name = replaceIllegalChars(parsed.name);

  return path.join(dir, `${name}${parsed.ext}`);
}

function hexToHSL(str: string) {
  let rStr = '0',
    gStr = '0',
    bStr = '0';

  if (str.length == 4) {
    rStr = '0x' + str[1] + str[1];
    gStr = '0x' + str[2] + str[2];
    bStr = '0x' + str[3] + str[3];
  } else if (str.length == 7) {
    rStr = '0x' + str[1] + str[2];
    gStr = '0x' + str[3] + str[4];
    bStr = '0x' + str[5] + str[6];
  }

  const r = +rStr / 255;
  const g = +gStr / 255;
  const b = +bStr / 255;

  const cmin = Math.min(r, g, b),
    cmax = Math.max(r, g, b),
    delta = cmax - cmin;

  let h = 0,
    s = 0,
    l = 0;

  if (delta == 0) h = 0;
  else if (cmax == r) h = ((g - b) / delta) % 6;
  else if (cmax == g) h = (b - r) / delta + 2;
  else h = (r - g) / delta + 4;

  h = Math.round(h * 60);

  if (h < 0) h += 360;

  l = (cmax + cmin) / 2;
  s = delta == 0 ? 0 : delta / (1 - Math.abs(2 * l - 1));
  s = +(s * 100).toFixed(1);
  l = +(l * 100).toFixed(1);

  return { h, s, l };
}

export function getColorCategory(hex: string) {
  const { h, s, l } = hexToHSL(hex);

  // define color category based on HSL
  if (l < 12) {
    return 'Black';
  }
  if (l > 98) {
    return 'White';
  }
  if (s < 2) {
    return 'Gray';
  }
  if (h < 15) {
    return 'Red';
  }
  if (h < 45) {
    return 'Orange';
  }
  if (h < 65) {
    return 'Yellow';
  }
  if (h < 170) {
    return 'Green';
  }
  if (h < 190) {
    return 'Cyan';
  }
  if (h < 255) {
    return 'Blue';
  }
  if (h < 280) {
    return 'Purple';
  }
  if (h < 335) {
    return 'Magenta';
  }
  return 'Red';
}

/**
 * Open a PDF at a given page (or try to)
 *
 * zotero://open-pdf/library/items/[itemKey]?page=[page]
 * zotero://open-pdf/groups/[groupID]/items/[itemKey]?page=[page]
 *
 * Also supports ZotFile format:
 * zotero://open-pdf/[libraryID]_[key]/[page]
 */

/**
 * Select an item
 *
 * zotero://select/library/items/[itemKey]
 * zotero://select/groups/[groupID]/items/[itemKey]
 *
 * Deprecated:
 *
 * zotero://select/[type]/0_ABCD1234
 * zotero://select/[type]/1234 (not consistent across synced machines)
 */
export async function convertImageToFormat(
  inputPath: string,
  outputPath: string,
  format: string,
  quality: number
): Promise<void> {
  const inputData = readFileSync(inputPath);
  const blob = new Blob([inputData]);
  const url = URL.createObjectURL(blob);
  try {
    const img = new Image();
    img.src = url;
    await new Promise<void>((resolve, reject) => {
      img.onload = () => resolve();
      img.onerror = reject;
    });
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(img, 0, 0);

    if (format === 'avif') {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const avifModule = await getAvifEncoder();
      const options = { ...avifDefaultOptions, quality };
      const output = avifModule.encode(
        new Uint8Array(imageData.data.buffer),
        imageData.width,
        imageData.height,
        options
      );
      if (!output) throw new Error('AVIF encoding failed');
      writeFileSync(outputPath, Buffer.from(output.buffer));
    } else {
      // webp (and any other canvas-supported format)
      const outputBlob = await new Promise<Blob>((resolve, reject) =>
        canvas.toBlob(
          (b) =>
            b ? resolve(b) : reject(new Error('Image conversion failed')),
          `image/${format}`,
          quality / 100
        )
      );
      writeFileSync(outputPath, Buffer.from(await outputBlob.arrayBuffer()));
    }
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function getLocalURI(
  ext: 'select' | 'open-pdf',
  uri: string,
  params?: Record<string, string>
) {
  const itemId = uri.split('/').pop();
  const prefix = `zotero://${ext}`;
  let url = '';

  if (/group/.test(uri)) {
    url = uri.replace('http://zotero.org', prefix);
  } else {
    url = `${prefix}/library/items/${itemId}`;
  }

  if (params) {
    const p = new URLSearchParams(params);
    url += `?${p}`;
  }

  return url;
}
