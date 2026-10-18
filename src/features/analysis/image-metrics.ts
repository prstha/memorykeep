/** A single-channel image with luminance values from 0 (black) to 1 (white). */
export type GrayImage = { width: number; height: number; data: Float32Array };

/** Converts RGBA bytes (as decoded from a JPEG) to luminance. */
export function toGray(rgba: Uint8Array, width: number, height: number): GrayImage {
  const data = new Float32Array(width * height);
  for (let i = 0, p = 0; i < data.length; i++, p += 4) {
    data[i] = (0.299 * rgba[p] + 0.587 * rgba[p + 1] + 0.114 * rgba[p + 2]) / 255;
  }
  return { width, height, data };
}

/** Downscales by averaging the source pixels that fall into each target pixel. */
export function resizeGray(img: GrayImage, width: number, height: number): GrayImage {
  const data = new Float32Array(width * height);
  const sx = img.width / width;
  const sy = img.height / height;
  for (let y = 0; y < height; y++) {
    const y0 = Math.floor(y * sy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * sy));
    for (let x = 0; x < width; x++) {
      const x0 = Math.floor(x * sx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * sx));
      let sum = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) sum += img.data[yy * img.width + xx];
      }
      data[y * width + x] = sum / ((y1 - y0) * (x1 - x0));
    }
  }
  return { width, height, data };
}

/**
 * 64-bit difference hash as 16 hex characters: each bit says whether a pixel of a 9×8 thumbnail is
 * brighter than its right-hand neighbour. Near-identical photos get hashes a few bits apart.
 */
export function dHash(img: GrayImage): string {
  const small = resizeGray(img, 9, 8);
  let hex = '';
  for (let y = 0; y < 8; y++) {
    let byte = 0;
    for (let x = 0; x < 8; x++) {
      const i = y * 9 + x;
      byte = (byte << 1) | (small.data[i] > small.data[i + 1] ? 1 : 0);
    }
    hex += byte.toString(16).padStart(2, '0');
  }
  return hex;
}

const NIBBLE_BITS = [0, 1, 1, 2, 1, 2, 2, 3, 1, 2, 2, 3, 2, 3, 3, 4];

/** Number of differing bits between two hashes from `dHash`. */
export function hammingDistance(a: string, b: string): number {
  let d = 0;
  for (let i = 0; i < a.length; i++) d += NIBBLE_BITS[parseInt(a[i], 16) ^ parseInt(b[i], 16)];
  return d;
}

/**
 * Variance of the Laplacian: high when the image has crisp edges, low when it is blurry.
 * Only comparable between images of the same size, so callers should resize first.
 */
export function laplacianVariance(img: GrayImage): number {
  const { width: w, height: h, data } = img;
  let sum = 0;
  let sumSq = 0;
  let n = 0;
  for (let y = 1; y < h - 1; y++) {
    for (let x = 1; x < w - 1; x++) {
      const i = y * w + x;
      const v = data[i - w] + data[i + w] + data[i - 1] + data[i + 1] - 4 * data[i];
      sum += v;
      sumSq += v * v;
      n++;
    }
  }
  if (n === 0) return 0;
  const mean = sum / n;
  return sumSq / n - mean * mean;
}

export function meanBrightness(img: GrayImage): number {
  let sum = 0;
  for (let i = 0; i < img.data.length; i++) sum += img.data[i];
  return img.data.length ? sum / img.data.length : 0;
}
