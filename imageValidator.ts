/**
 * imageValidator.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Cloudmersive-powered image content validator for FadynBot.
 *
 * Call `validateImageUrl(url)` for each uploaded attachment URL.
 * The Discord CDN URL is fetched as a buffer and streamed to Cloudmersive's
 * /image/recognize/describe endpoint.  We use the description + confidence
 * score to decide whether the image is a real, meaningful reference/asset.
 *
 * Returns:
 *   { valid: true,  description: string }   → image is real and recognisable
 *   { valid: false, reason: string }         → blank, unrecognisable, or API error
 *
 * Fail-open: if Cloudmersive is unreachable or the key is missing, we return
 * valid: true so the upload flow is never broken by an API outage.
 *
 * Requires: CLOUDMERSIVE_API_KEY in your .env / Railway environment.
 * ─────────────────────────────────────────────────────────────────────────────
 */

import axios from "axios";
import FormData from "form-data";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ImageValidationResult {
  valid: boolean;
  description?: string;
  reason?: string;
}

// ─── Constants ────────────────────────────────────────────────────────────────

const CLOUDMERSIVE_URL = "https://api.cloudmersive.com/image/recognize/describe";
const API_KEY = process.env.CLOUDMERSIVE_API_KEY ?? "bb67625d-23cc-4b78-88f7-03b7ae708474";

/**
 * Minimum confidence score (0–1) required to consider an image valid.
 * Cloudmersive returns ~0.0 for blank/corrupted images and 0.5–0.9+ for real ones.
 */
const MIN_CONFIDENCE = 0.2;

/**
 * Descriptions that Cloudmersive returns for images it cannot identify at all.
 * If the best-match description matches any of these, we reject the image.
 */
const UNRECOGNISED_PATTERNS = [
  /^no description/i,
  /^unknown/i,
  /^n\/a/i,
  /^image/i,        // bare "image" with nothing useful
  /^picture/i,
  /^\s*$/,
];

// ─── Main export ──────────────────────────────────────────────────────────────

/**
 * Downloads the image from `url` and sends it to Cloudmersive for recognition.
 * Works with Discord CDN URLs (no local file system needed).
 */
export async function validateImageUrl(url: string): Promise<ImageValidationResult> {
  if (!API_KEY) {
    // No key configured — fail-open
    return { valid: true };
  }

  try {
    // 1. Download the image as an ArrayBuffer
    const download = await axios.get<ArrayBuffer>(url, {
      responseType: "arraybuffer",
      timeout: 10_000,
    });

    const buffer = Buffer.from(download.data);

    // 2. Derive a filename from the URL (Cloudmersive needs a file extension)
    const rawName = url.split("?")[0]?.split("/").pop() ?? "image.jpg";
    const filename = rawName.includes(".") ? rawName : `${rawName}.jpg`;

    // 3. Build a multipart form with the image buffer
    const form = new FormData();
    form.append("imageFile", buffer, {
      filename,
      contentType: download.headers["content-type"] ?? "image/jpeg",
    });

    // 4. POST to Cloudmersive
    const res = await axios.post<{ BestMatchDescription: string; ConfidenceScore: number }>(
      CLOUDMERSIVE_URL,
      form,
      {
        headers: {
          ...form.getHeaders(),
          Apikey: API_KEY,
        },
        timeout: 15_000,
      }
    );

    const { BestMatchDescription: desc, ConfidenceScore: score } = res.data;

    // 5. Evaluate the result
    const isUnrecognised = UNRECOGNISED_PATTERNS.some((p) => p.test(desc ?? ""));

    if (isUnrecognised || score < MIN_CONFIDENCE) {
      return {
        valid: false,
        reason: `The image couldn't be identified (${desc ?? "no description"}, confidence ${(score * 100).toFixed(0)}%). Please upload a clear reference image.`,
      };
    }

    return { valid: true, description: desc };
  } catch (err: any) {
    // Network error, timeout, or Cloudmersive outage — fail-open
    console.error("[imageValidator] Error:", err?.response?.data ?? err?.message ?? err);
    return { valid: true };
  }
}

/**
 * Validates multiple image URLs in parallel.
 * Returns a map of url → result so the caller can report per-file failures.
 */
export async function validateImageUrls(
  urls: string[]
): Promise<Map<string, ImageValidationResult>> {
  const entries = await Promise.all(
    urls.map(async (url) => [url, await validateImageUrl(url)] as const)
  );
  return new Map(entries);
}
