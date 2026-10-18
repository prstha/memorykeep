import FaceDetection from '@react-native-ml-kit/face-detection';
import { File } from 'expo-file-system';
import { ImageManipulator, SaveFormat } from 'expo-image-manipulator';
import { Asset } from 'expo-media-library';
import { decode } from 'jpeg-js';

import type { PhotoAnalysis } from '@/features/analysis/assess';
import { dHash, laplacianVariance, meanBrightness, resizeGray, toGray } from '@/features/analysis/image-metrics';

/** Photos are decoded at this width; enough for face detection, small enough to decode in JS. */
const WORKING_WIDTH = 512;
/** Sharpness is measured at a fixed size so values compare across photos. */
const METRIC_WIDTH = 256;

/** Set once face detection fails to load, so the rest of the run skips it instead of failing each photo. */
let faceDetectionUnavailable = false;

/**
 * Measures one device photo: perceptual hash, sharpness, brightness and faces.
 * Works on a downscaled temporary copy that is deleted afterwards.
 */
export async function analyzePhoto(photoId: string): Promise<PhotoAnalysis> {
  const uri = await new Asset(photoId).getUri();
  const rendered = await ImageManipulator.manipulate(uri, { maxWidth: WORKING_WIDTH * 2 })
    .resize({ width: WORKING_WIDTH, height: null })
    .renderAsync();
  const saved = await rendered.saveAsync({ format: SaveFormat.JPEG, compress: 0.9 });
  const file = new File(saved.uri);

  try {
    const jpeg = decode(await file.bytes(), { useTArray: true, formatAsRGBA: true });
    const gray = toGray(jpeg.data, jpeg.width, jpeg.height);
    const metricHeight = Math.max(1, Math.round((gray.height * METRIC_WIDTH) / gray.width));
    const small = resizeGray(gray, METRIC_WIDTH, metricHeight);
    const { faces, smile } = await detectFaces(saved.uri);

    return {
      photoId,
      dhash: dHash(small),
      sharpness: laplacianVariance(small),
      brightness: meanBrightness(small),
      faces,
      smile,
    };
  } finally {
    try {
      file.delete();
    } catch {
      // A leftover file in the cache directory is harmless.
    }
  }
}

async function detectFaces(uri: string): Promise<{ faces: number | null; smile: number | null }> {
  if (faceDetectionUnavailable) return { faces: null, smile: null };
  try {
    const found = await FaceDetection.detect(uri, { performanceMode: 'fast', classificationMode: 'all' });
    const smiles = found.map((f) => f.smilingProbability).filter((s): s is number => s != null);
    return { faces: found.length, smile: smiles.length ? Math.max(...smiles) : null };
  } catch (e) {
    console.warn('Face detection unavailable, continuing without it', e);
    faceDetectionUnavailable = true;
    return { faces: null, smile: null };
  }
}
