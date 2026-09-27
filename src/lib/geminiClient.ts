import type { ManualMedication } from "@/components/ManualRxEntry";
import type { PatientData } from "@/components/PatientSidebar";
import type {
  DosageValidation,
  MedicationEntry,
  VerdictData,
} from "@/components/VerdictCards";
import { fuzzyMatchDrugName } from "@/lib/drugDictionary";

interface AnalyzeInput {
  patient: PatientData;
  reportFile: File | null;
  prescriptionFile: File | null;
  manualMedications: ManualMedication[];
  instructions: string;
}

type GeminiPart =
  | { text: string }
  | {
      inline_data: {
        mime_type: string;
        data: string;
      };
    };

interface GeminiResponse {
  candidates?: Array<{
    content?: {
      parts?: Array<{
        text?: string;
      }>;
    };
    finishReason?: string;
  }>;
  promptFeedback?: {
    blockReason?: string;
  };
}

interface GeminiErrorPayload {
  error?: {
    code?: number;
    message?: string;
    status?: string;
    details?: Array<{
      "@type"?: string;
      retryDelay?: string;
    }>;
  };
}

interface LineRange {
  top: number;
  bottom: number;
  left: number;
  right: number;
}

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY as string | undefined;
const GEMINI_MODEL = (import.meta.env.VITE_GEMINI_MODEL as string | undefined) ?? "gemini-2.5-flash";
const GEMINI_EXTRACTION_MODEL =
  (import.meta.env.VITE_GEMINI_EXTRACTION_MODEL as string | undefined)?.trim() || GEMINI_MODEL;
const GEMINI_EXTRACTION_RESCUE_MODEL =
  (import.meta.env.VITE_GEMINI_EXTRACTION_RESCUE_MODEL as string | undefined)?.trim() || "gemini-2.5-pro";
const GEMINI_VALIDATION_MODEL =
  (import.meta.env.VITE_GEMINI_VALIDATION_MODEL as string | undefined)?.trim() || GEMINI_MODEL;
const DEFAULT_EXTRACTION_MODEL_FALLBACKS = ["gemini-2.5-flash"] as const;
const DEFAULT_VALIDATION_MODEL_FALLBACKS = ["gemini-2.5-flash"] as const;
const RX_OCR_MODE = ((import.meta.env.VITE_RX_OCR_MODE as string | undefined) ?? "fast").toLowerCase();
const USE_FAST_OCR = RX_OCR_MODE !== "accurate";
const RX_DEEP_EXTRACTION_MODE =
  ((import.meta.env.VITE_RX_DEEP_EXTRACTION as string | undefined) ?? "auto").toLowerCase();
const ENABLE_DEEP_EXTRACTION_ALWAYS =
  RX_DEEP_EXTRACTION_MODE === "true" || RX_DEEP_EXTRACTION_MODE === "always";
const ENABLE_DEEP_EXTRACTION_AUTO = RX_DEEP_EXTRACTION_MODE === "auto";
const CLINICAL_FIRST_EXTRACTION =
  ((import.meta.env.VITE_RX_CLINICAL_FIRST as string | undefined) ?? "true").toLowerCase() === "true";
const ENABLE_HEAVY_RECOVERY =
  ((import.meta.env.VITE_RX_HEAVY_RECOVERY as string | undefined) ?? "false").toLowerCase() === "true";
const MAX_RATE_LIMIT_AUTO_RETRIES = 1;
const MAX_RATE_LIMIT_RETRY_WAIT_SECONDS = 40;
const MAX_LINE_SNIPPETS = USE_FAST_OCR ? 3 : 8;
const MAX_IMAGE_WIDTH = USE_FAST_OCR ? 1200 : 1600;

const STRICT_EXTRACTION_SYSTEM_INSTRUCTION =
  "You are a medical prescription OCR engine. Extract only what is visually present, avoid hallucinations, and return JSON only.";
const CLINICAL_EXTRACTION_SYSTEM_INSTRUCTION =
  "You are a professional medical data extraction specialist. Decipher difficult prescription handwriting with clinical lexicon awareness, but do not invent medications not visually plausible.";
const VALIDATION_SYSTEM_INSTRUCTION =
  "You are a clinical prescription safety validator. Provide precise, concise, medically cautious JSON output only.";

const MEDICATION_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    name: { type: "STRING" },
    dosage: { type: "STRING" },
    frequency: { type: "STRING" },
    route: { type: "STRING" },
    confidence: { type: "STRING" },
    raw_text: { type: "STRING" },
    uncertainty_notes: { type: "STRING" },
  },
  required: ["name", "dosage", "frequency", "route"],
};

const LINE_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    medication: MEDICATION_SCHEMA,
  },
  required: ["medication"],
};

const PAGE_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    medications: {
      type: "ARRAY",
      items: MEDICATION_SCHEMA,
    },
  },
  required: ["medications"],
};

const TRANSCRIPTION_SCHEMA: Record<string, unknown> = {
  type: "OBJECT",
  properties: {
    lines: {
      type: "ARRAY",
      items: {
        type: "OBJECT",
        properties: {
          line_no: { type: "STRING" },
          text: { type: "STRING" },
        },
        required: ["text"],
      },
    },
    full_text: { type: "STRING" },
  },
  required: ["lines"],
};

type GeminiTask = "extraction" | "validation";

interface GeminiRequestOptions {
  task?: GeminiTask;
  systemInstruction?: string;
  responseSchema?: Record<string, unknown>;
  preferredModels?: string[];
  temperature?: number;
}

function toTitleCase(value: string): string {
  return value
    .split(" ")
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(" ");
}

function isMissingText(value: string): boolean {
  const normalized = value.trim().toLowerCase();
  return (
    normalized === "" ||
    normalized === "not specified" ||
    normalized === "unknown" ||
    normalized === "unclear" ||
    normalized === "illegible" ||
    normalized === "n/a"
  );
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitOrQuotaError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return /(rate limit|resource_exhausted|retry in about|quota|limit:\s*0|429)/i.test(error.message);
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Unable to read file content."));
        return;
      }
      const base64 = reader.result.split(",")[1];
      if (!base64) {
        reject(new Error("Unable to encode file as base64."));
        return;
      }
      resolve(base64);
    };
    reader.onerror = () => reject(new Error("File read failed."));
    reader.readAsDataURL(file);
  });
}

async function fileToInlinePart(file: File): Promise<GeminiPart> {
  const base64 = await fileToBase64(file);
  return {
    inline_data: {
      mime_type: file.type || "application/octet-stream",
      data: base64,
    },
  };
}

function extractJsonPayload(rawText: string): unknown {
  const text = rawText
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  try {
    return JSON.parse(text);
  } catch {
    const firstBrace = text.indexOf("{");
    const lastBrace = text.lastIndexOf("}");
    if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
      throw new Error("Model returned a non-JSON response.");
    }

    const fragment = text.slice(firstBrace, lastBrace + 1);
    return JSON.parse(fragment);
  }
}

function normalizeStatus(value: unknown): DosageValidation["status"] {
  const normalized = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (normalized === "safe" || normalized === "caution" || normalized === "danger") {
    return normalized;
  }
  return "caution";
}

function normalizeAction(value: unknown): DosageValidation["action"] | undefined {
  const normalized = typeof value === "string" ? value.toLowerCase().trim() : "";
  if (
    normalized === "keep" ||
    normalized === "increase" ||
    normalized === "decrease" ||
    normalized === "stop" ||
    normalized === "clarify"
  ) {
    return normalized;
  }
  return undefined;
}

function normalizeMedications(value: unknown): MedicationEntry[] {
  if (!Array.isArray(value)) return [];

  return value
    .map((entry): MedicationEntry | null => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      const name = String(record.name ?? record.medication_name ?? "").trim();
      if (!name) return null;

      const category = String(record.category ?? "").trim();
      return {
        name,
        dosage: String(record.dosage ?? record.strength ?? "Not specified"),
        frequency: String(record.frequency ?? record.schedule ?? record.instructions ?? "Not specified"),
        route: String(record.route ?? record.form ?? "Not specified"),
        ...(category ? { category } : {}),
      };
    })
    .filter((entry): entry is MedicationEntry => Boolean(entry));
}

function normalizeValidations(value: unknown): DosageValidation[] {
  if (!Array.isArray(value)) return [];

  const normalized: DosageValidation[] = [];

  for (const entry of value) {
    if (!entry || typeof entry !== "object") continue;

    const record = entry as Record<string, unknown>;
    const medication = String(record.medication ?? "").trim();
    const message = String(record.message ?? record.rationale ?? "").trim();

    if (!medication || !message) continue;

    const item: DosageValidation = {
      medication,
      status: normalizeStatus(record.status),
      message,
    };

    const action = normalizeAction(record.action);
    if (action) {
      item.action = action;
    }

    const adjustment = String(record.adjustment ?? "").trim();
    if (adjustment) {
      item.adjustment = adjustment;
    }

    normalized.push(item);
  }

  return normalized;
}

function safeJsonParse<T>(value: string): T | null {
  try {
    return JSON.parse(value) as T;
  } catch {
    return null;
  }
}

function extractRetryDelaySeconds(payload: GeminiErrorPayload): number | null {
  const details = payload.error?.details;
  if (!details || !Array.isArray(details)) return null;

  for (const detail of details) {
    if (!detail?.retryDelay) continue;
    const match = /(\d+)s/.exec(detail.retryDelay);
    if (match) {
      return Number(match[1]);
    }
  }

  return null;
}

function isZeroQuotaError(status: number, errorText: string): boolean {
  if (status !== 429) return false;
  return /limit:\s*0/i.test(errorText);
}

function shouldTryNextModel(status: number, errorText: string): boolean {
  if (status === 404) return true;
  if (status === 403 && /(permission|forbidden|quota|model)/i.test(errorText)) return true;
  if (status === 400 && /(model|not found|unsupported|unavailable)/i.test(errorText)) return true;
  return false;
}

function shouldRetryWithoutSchema(status: number, errorText: string): boolean {
  if (status !== 400) return false;
  return /(responseSchema|response schema|unknown name .*responseSchema|invalid json payload|schema)/i.test(
    errorText,
  );
}

function formatGeminiHttpError(status: number, errorText: string, model: string): string {
  const payload = safeJsonParse<GeminiErrorPayload>(errorText);
  const rawMessage = payload?.error?.message?.trim();
  const message = rawMessage || errorText.trim();

  if (status === 429) {
    const hasZeroQuota = /limit:\s*0/i.test(message);
    if (hasZeroQuota) {
      return `Gemini quota is disabled for model "${model}" in this API project (limit is 0). Enable billing/quota in Google AI Studio or use a key/project with available quota.`;
    }

    const retrySeconds = extractRetryDelaySeconds(payload ?? {});
    if (retrySeconds && retrySeconds > 0) {
      return `Gemini model "${model}" is rate limited. Retry in about ${retrySeconds} seconds.`;
    }

    return `Gemini model "${model}" rate limit reached. Please retry in a moment.`;
  }

  if (message) {
    return `Gemini request failed for model "${model}" (${status}): ${message}`;
  }

  return `Gemini request failed for model "${model}" with HTTP ${status}.`;
}

function resolveModelsToTry(task: GeminiTask, preferredModels?: string[]): string[] {
  const taskDefaults =
    task === "extraction"
      ? [GEMINI_EXTRACTION_MODEL, ...DEFAULT_EXTRACTION_MODEL_FALLBACKS]
      : [GEMINI_VALIDATION_MODEL, ...DEFAULT_VALIDATION_MODEL_FALLBACKS];

  const candidates = [...(preferredModels ?? []), ...taskDefaults];

  return candidates.filter((model, index, arr): model is string => {
    if (!model) return false;
    return arr.indexOf(model) === index;
  });
}

function extractResponseText(payload: GeminiResponse): string {
  const blockReason = payload.promptFeedback?.blockReason;
  if (blockReason) {
    throw new Error(`Gemini blocked the request: ${blockReason}`);
  }

  const rawText = payload.candidates?.[0]?.content?.parts
    ?.map((part) => part.text)
    .filter(Boolean)
    .join("\n");

  if (!rawText) {
    const reason = payload.candidates?.[0]?.finishReason;
    throw new Error(`Gemini returned no content${reason ? ` (finish reason: ${reason})` : ""}.`);
  }

  return rawText;
}

async function generateWithGemini(parts: GeminiPart[], options: GeminiRequestOptions = {}): Promise<GeminiResponse> {
  const task = options.task ?? "validation";
  const modelsToTry = resolveModelsToTry(task, options.preferredModels);
  let lastHttpError: { status: number; errorText: string; model: string } | null = null;

  for (let i = 0; i < modelsToTry.length; i += 1) {
    const model = modelsToTry[i];
    const isLastModel = i === modelsToTry.length - 1;
    const schemaAttempts = options.responseSchema ? [true, false] : [false];
    let moveToNextModel = false;

    for (const useSchema of schemaAttempts) {
      let rateLimitRetries = 0;

      while (true) {
        const requestBody: Record<string, unknown> = {
          contents: [{ role: "user", parts }],
          generationConfig: {
            temperature: options.temperature ?? 0.0,
            responseMimeType: "application/json",
          },
        };

        if (options.systemInstruction) {
          requestBody.systemInstruction = {
            parts: [{ text: options.systemInstruction }],
          };
        }

        if (useSchema && options.responseSchema) {
          const generationConfig = requestBody.generationConfig as Record<string, unknown>;
          generationConfig.responseSchema = options.responseSchema;
        }

        const response = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(
            model,
          )}:generateContent?key=${encodeURIComponent(GEMINI_API_KEY as string)}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(requestBody),
          },
        );

        if (!response.ok) {
          const errorText = await response.text();
          lastHttpError = { status: response.status, errorText, model };

          if (useSchema && shouldRetryWithoutSchema(response.status, errorText)) {
            break;
          }

          if (response.status === 429 && !isZeroQuotaError(response.status, errorText)) {
            const payload = safeJsonParse<GeminiErrorPayload>(errorText);
            const retrySeconds = extractRetryDelaySeconds(payload ?? {});

            if (
              retrySeconds &&
              retrySeconds > 0 &&
              retrySeconds <= MAX_RATE_LIMIT_RETRY_WAIT_SECONDS &&
              rateLimitRetries < MAX_RATE_LIMIT_AUTO_RETRIES
            ) {
              rateLimitRetries += 1;
              await delay((retrySeconds + 1) * 1000);
              continue;
            }

            throw new Error(formatGeminiHttpError(response.status, errorText, model));
          }

          if (
            !isLastModel &&
            (isZeroQuotaError(response.status, errorText) || shouldTryNextModel(response.status, errorText))
          ) {
            moveToNextModel = true;
            break;
          }

          throw new Error(formatGeminiHttpError(response.status, errorText, model));
        }

        return (await response.json()) as GeminiResponse;
      }
    }

    if (moveToNextModel) {
      continue;
    }
  }

  if (lastHttpError) {
    throw new Error(
      formatGeminiHttpError(lastHttpError.status, lastHttpError.errorText, lastHttpError.model),
    );
  }

  throw new Error(`Gemini request failed. No model could be used. Check VITE_GEMINI_MODEL or use ${GEMINI_MODEL}.`);
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result !== "string") {
        reject(new Error("Failed to load image."));
        return;
      }

      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Failed to decode image."));
      image.src = reader.result;
    };
    reader.onerror = () => reject(new Error("Failed to read image file."));
    reader.readAsDataURL(file);
  });
}

function canvasToPngFile(canvas: HTMLCanvasElement, fileName: string): Promise<File> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error("Failed to create image blob."));
        return;
      }
      resolve(new File([blob], fileName, { type: "image/png" }));
    }, "image/png");
  });
}

function enhanceCanvasForHandwriting(canvas: HTMLCanvasElement): Uint8ClampedArray {
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable.");

  const { width, height } = canvas;
  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;
  const gray = new Float32Array(width * height);

  let sum = 0;
  let sqSum = 0;

  for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
    const g = 0.299 * data[i] + 0.587 * data[i + 1] + 0.114 * data[i + 2];
    gray[pixel] = g;
    sum += g;
    sqSum += g * g;
  }

  const count = gray.length;
  const mean = sum / count;
  const variance = Math.max(0, sqSum / count - mean * mean);
  const stdDev = Math.sqrt(variance);

  // Contrast stretch + threshold for handwriting clarity
  const threshold = clamp(Math.round(mean - stdDev * 0.15), 85, 205);

  for (let i = 0, pixel = 0; i < data.length; i += 4, pixel += 1) {
    let v = gray[pixel];
    v = (v - 128) * 1.6 + 128;
    const binary = v < threshold ? 0 : 255;
    data[i] = binary;
    data[i + 1] = binary;
    data[i + 2] = binary;
    data[i + 3] = 255;
  }

  ctx.putImageData(imageData, 0, 0);
  return data;
}

function detectTextLineRanges(binaryData: Uint8ClampedArray, width: number, height: number): LineRange[] {
  const rowInkRatio: number[] = new Array(height).fill(0);

  for (let y = 0; y < height; y += 1) {
    let darkPixels = 0;
    for (let x = 0; x < width; x += 1) {
      const idx = (y * width + x) * 4;
      if (binaryData[idx] <= 90) {
        darkPixels += 1;
      }
    }
    rowInkRatio[y] = darkPixels / width;
  }

  const activeThreshold = 0.012;
  const maxGap = 7;
  const minHeight = 14;

  const rawSegments: Array<{ start: number; end: number }> = [];
  let start = -1;

  for (let y = 0; y < height; y += 1) {
    if (rowInkRatio[y] > activeThreshold) {
      if (start === -1) start = y;
    } else if (start !== -1) {
      rawSegments.push({ start, end: y - 1 });
      start = -1;
    }
  }

  if (start !== -1) {
    rawSegments.push({ start, end: height - 1 });
  }

  const merged: Array<{ start: number; end: number }> = [];
  for (const segment of rawSegments) {
    const prev = merged[merged.length - 1];
    if (!prev) {
      merged.push(segment);
      continue;
    }

    if (segment.start - prev.end <= maxGap) {
      prev.end = segment.end;
    } else {
      merged.push(segment);
    }
  }

  const ranges: LineRange[] = [];

  for (const segment of merged) {
    const segHeight = segment.end - segment.start + 1;
    if (segHeight < minHeight) continue;

    const colInk: number[] = new Array(width).fill(0);
    for (let x = 0; x < width; x += 1) {
      let dark = 0;
      for (let y = segment.start; y <= segment.end; y += 1) {
        const idx = (y * width + x) * 4;
        if (binaryData[idx] <= 90) dark += 1;
      }
      colInk[x] = dark;
    }

    const colThreshold = Math.max(2, Math.floor(segHeight * 0.05));
    let left = -1;
    let right = -1;

    for (let x = 0; x < width; x += 1) {
      if (colInk[x] >= colThreshold) {
        left = x;
        break;
      }
    }

    for (let x = width - 1; x >= 0; x -= 1) {
      if (colInk[x] >= colThreshold) {
        right = x;
        break;
      }
    }

    if (left === -1 || right === -1 || right <= left) continue;

    ranges.push({
      top: clamp(segment.start - 6, 0, height - 1),
      bottom: clamp(segment.end + 6, 0, height - 1),
      left: clamp(left - 10, 0, width - 1),
      right: clamp(right + 10, 0, width - 1),
    });
  }

  return ranges.slice(0, MAX_LINE_SNIPPETS);
}

async function preprocessAndSplitPrescription(
  prescriptionFile: File,
  includeLineSplits: boolean,
): Promise<{ enhancedFile: File; lineFiles: File[] }> {
  if (!prescriptionFile.type.startsWith("image/")) {
    return { enhancedFile: prescriptionFile, lineFiles: [prescriptionFile] };
  }

  const image = await loadImageFromFile(prescriptionFile);
  const scale = image.width > MAX_IMAGE_WIDTH ? MAX_IMAGE_WIDTH / image.width : 1;

  const width = Math.max(1, Math.round(image.width * scale));
  const height = Math.max(1, Math.round(image.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Canvas context unavailable.");

  ctx.drawImage(image, 0, 0, width, height);
  const binaryData = enhanceCanvasForHandwriting(canvas);
  const enhancedFile = await canvasToPngFile(canvas, `enhanced_${prescriptionFile.name}.png`);

  if (!includeLineSplits) {
    return { enhancedFile, lineFiles: [enhancedFile] };
  }

  const lineRanges = detectTextLineRanges(binaryData, width, height);
  const lineFiles: File[] = [];

  for (let i = 0; i < lineRanges.length; i += 1) {
    const range = lineRanges[i];
    const cropWidth = range.right - range.left + 1;
    const cropHeight = range.bottom - range.top + 1;

    if (cropWidth < 40 || cropHeight < 12) continue;

    const cropCanvas = document.createElement("canvas");
    cropCanvas.width = cropWidth;
    cropCanvas.height = cropHeight;

    const cropCtx = cropCanvas.getContext("2d");
    if (!cropCtx) continue;

    cropCtx.drawImage(
      canvas,
      range.left,
      range.top,
      cropWidth,
      cropHeight,
      0,
      0,
      cropWidth,
      cropHeight,
    );

    const lineFile = await canvasToPngFile(cropCanvas, `rx_line_${i + 1}.png`);
    lineFiles.push(lineFile);
  }

  return {
    enhancedFile,
    lineFiles: lineFiles.length > 0 ? lineFiles : [enhancedFile],
  };
}

async function cropPrescriptionRegion(
  prescriptionFile: File,
  startRatio: number,
  endRatio = 1,
): Promise<File | null> {
  if (!prescriptionFile.type.startsWith("image/")) {
    return null;
  }

  const image = await loadImageFromFile(prescriptionFile);
  const safeStart = clamp(startRatio, 0, 1);
  const safeEnd = clamp(endRatio, 0, 1);
  if (safeEnd <= safeStart) return null;

  const top = Math.floor(image.height * safeStart);
  const cropHeight = Math.floor(image.height * (safeEnd - safeStart));
  if (cropHeight < 60) return null;

  const canvas = document.createElement("canvas");
  canvas.width = image.width;
  canvas.height = cropHeight;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  ctx.drawImage(image, 0, top, image.width, cropHeight, 0, 0, image.width, cropHeight);
  return canvasToPngFile(canvas, `crop_${prescriptionFile.name}.png`);
}

function buildLineExtractionPrompt(lineNumber: number, totalLines: number): string {
  return `You are a prescription OCR/transcription engine.
Line ${lineNumber} of ${totalLines} from a prescription is provided.

Rules:
1. Read only what is visually written. Do not infer medications from diagnosis, age, or lab context.
2. Do not replace unknown text with common drugs.
3. If handwriting is unclear, keep the closest literal transcription and set confidence to "low".
4. Keep brand names if that is what appears on the prescription.
5. Return ONLY strict JSON.

Return ONLY valid JSON:
{
  "medication": {
    "name": "string",
    "dosage": "string",
    "frequency": "string",
    "route": "string",
    "confidence": "high | medium | low",
    "raw_text": "string",
    "uncertainty_notes": "string"
  }
}`;
}

function buildFullPageExtractionPrompt(): string {
  return `You are a prescription OCR/transcription engine.
Analyze the full prescription image and extract only medications that are visibly written.

Rules:
1. Do not use clinical reasoning to substitute likely medications.
2. Do not add medications that are not explicitly present in the image.
3. Keep uncertain words as literal transcription with low confidence.
4. Preserve written order from top to bottom.
5. Return ONLY strict JSON.

Return ONLY valid JSON:
{
  "medications": [
    {
      "name": "string",
      "dosage": "string",
      "frequency": "string",
      "route": "string",
      "confidence": "high | medium | low",
      "raw_text": "string",
      "uncertainty_notes": "string"
    }
  ]
}`;
}

function buildClinicalRecoveryPrompt(patient: PatientData): string {
  return `You are a professional Medical Data Extraction Specialist.
Analyze this handwritten prescription and extract medications with best-effort clinical decoding.

Rules:
1. Use visual text first; do not invent medications that are not visually plausible.
2. If text is partially unclear, map to the closest likely real medication/brand name and keep confidence "low" or "medium".
3. Keep output concise and strictly in JSON.
4. Preserve top-to-bottom medication order.

Patient context:
${JSON.stringify(
    {
      age: patient.age,
      gender: patient.gender,
      weightKg: patient.weight,
      allergies: patient.allergies,
      conditions: patient.conditions,
    },
    null,
    2,
  )}

Return ONLY valid JSON:
{
  "medications": [
    {
      "name": "string",
      "dosage": "string",
      "frequency": "string",
      "route": "string",
      "confidence": "high | medium | low",
      "raw_text": "string",
      "uncertainty_notes": "string"
    }
  ]
}`;
}

function buildTranscriptionPrompt(patient: PatientData): string {
  return `You are an expert prescription transcription specialist.
Read the prescription image and transcribe visible handwritten lines as accurately as possible.

Rules:
1. Keep original words as written when possible.
2. If a word is unclear, provide the closest plausible transcription.
3. Preserve top-to-bottom order.
4. Focus extra attention on medication lines, typically near the lower half.
5. Return only strict JSON.

Patient context for light clinical disambiguation:
${JSON.stringify(
    {
      age: patient.age,
      gender: patient.gender,
      allergies: patient.allergies,
      conditions: patient.conditions,
    },
    null,
    2,
  )}

Return ONLY valid JSON:
{
  "lines": [
    { "line_no": "1", "text": "string" }
  ],
  "full_text": "optional full transcription string"
}`;
}

function normalizeExtractionPayload(payload: unknown): MedicationEntry[] {
  if (!payload) return [];

  if (Array.isArray(payload)) {
    return normalizeMedications(payload);
  }

  if (typeof payload !== "object") return [];

  const record = payload as Record<string, unknown>;

  const medicationObject = record.medication;
  if (medicationObject && typeof medicationObject === "object") {
    const fromMedicationObject = normalizeMedications([medicationObject]);
    if (fromMedicationObject.length > 0) return fromMedicationObject;
  }

  const fromList = normalizeMedications(record.medications);
  if (fromList.length > 0) return fromList;

  const singleName = String(record.medication_name ?? record.name ?? "").trim();
  if (!singleName) return [];

  return [
    {
      name: singleName,
      dosage: String(record.dosage ?? record.strength ?? "Not specified"),
      frequency: String(record.frequency ?? record.instructions ?? "Not specified"),
      route: String(record.route ?? record.form ?? "Not specified"),
    },
  ];
}

function normalizeTranscriptionLines(payload: unknown): string[] {
  const lines: string[] = [];

  const pushLine = (value: unknown) => {
    const text = String(value ?? "").trim();
    if (text) lines.push(text);
  };

  if (!payload) return lines;

  if (Array.isArray(payload)) {
    for (const item of payload) {
      if (typeof item === "string") {
        pushLine(item);
      } else if (item && typeof item === "object") {
        pushLine((item as Record<string, unknown>).text);
      }
    }
  } else if (typeof payload === "object") {
    const record = payload as Record<string, unknown>;

    if (Array.isArray(record.lines)) {
      for (const line of record.lines) {
        if (typeof line === "string") {
          pushLine(line);
        } else if (line && typeof line === "object") {
          const lineRecord = line as Record<string, unknown>;
          pushLine(lineRecord.text ?? lineRecord.line ?? lineRecord.raw_text);
        }
      }
    }

    const fullText = String(record.full_text ?? record.text ?? record.transcription ?? "").trim();
    if (fullText) {
      for (const row of fullText.split(/\r?\n/)) {
        pushLine(row);
      }
    }
  } else {
    for (const row of String(payload).split(/\r?\n/)) {
      pushLine(row);
    }
  }

  return lines;
}

function extractDosageFromLine(line: string): string {
  const match = line.match(/\b\d+(?:\.\d+)?\s?(?:mg|mcg|g|gm|ml|iu)\b/i);
  return match ? match[0].replace(/\s+/g, " ").trim() : "Not specified";
}

function extractFrequencyFromLine(line: string): string {
  if (/\b(qid|four\s+times)\b/i.test(line)) return "Four times daily";
  if (/\b(tid|tds|three\s+times)\b/i.test(line)) return "Three times daily";
  if (/\b(bd|bid|twice\s+daily)\b/i.test(line)) return "Twice daily";
  if (/\b(od|once\s+daily|daily)\b/i.test(line)) return "Once daily";
  if (/\b(stat)\b/i.test(line)) return "Stat";
  if (/\b(sos|prn|as needed)\b/i.test(line)) return "As needed";
  return "Not specified";
}

function extractRouteFromLine(line: string): string {
  if (/\b(vaginal|pv)\b/i.test(line)) return "Vaginal";
  if (/\b(topical|cream|ointment|apply)\b/i.test(line)) return "Topical";
  if (/\b(inj|iv|im|injection)\b/i.test(line)) return "Injection";
  if (/\b(tab|tablet|cap|capsule|oral|po|syr|syp|susp)\b/i.test(line)) return "Oral";
  return "Not specified";
}

function inferMedicationsFromTranscribedLines(lines: string[]): MedicationEntry[] {
  const scored: Array<{ med: MedicationEntry; score: number }> = [];

  for (const originalLine of lines) {
    const line = originalLine.trim();
    if (line.length < 3) continue;

    const segments = line
      .split(/[\/|,+;]/)
      .map((segment) => segment.trim())
      .filter((segment) => segment.length >= 3);

    const candidates = segments.length > 0 ? segments : [line];

    for (const candidateText of candidates) {
      const match = fuzzyMatchDrugName(candidateText);
      if (!match) continue;

      const hasMedicationCue = /\b(tab|tablet|cap|capsule|cream|ointment|inj|syr|syp|drop|mg|ml|od|bd|bid|tid|qid|stat|sos|pc|ac)\b/i.test(
        line,
      );
      const threshold = hasMedicationCue ? 0.68 : 0.78;
      if (match.score < threshold) continue;

      scored.push({
        score: match.score,
        med: {
          name: toTitleCase(match.matchedTerm),
          dosage: extractDosageFromLine(line),
          frequency: extractFrequencyFromLine(line),
          route: extractRouteFromLine(line),
          category: match.category,
        },
      });
    }
  }

  scored.sort((a, b) => b.score - a.score);
  return dedupeMedications(scored.map((item) => item.med)).slice(0, 6);
}

function mergeMedicationLists(lineMeds: MedicationEntry[], pageMeds: MedicationEntry[]): MedicationEntry[] {
  if (lineMeds.length === 0) return pageMeds;
  if (pageMeds.length === 0) return lineMeds;

  const merged: MedicationEntry[] = lineMeds.map((lineMed, index) => {
    const pageMed = pageMeds[index];
    if (!pageMed) return lineMed;

    return {
      name: lineMed.name,
      dosage: isMissingText(lineMed.dosage) ? pageMed.dosage : lineMed.dosage,
      frequency: isMissingText(lineMed.frequency) ? pageMed.frequency : lineMed.frequency,
      route: isMissingText(lineMed.route) ? pageMed.route : lineMed.route,
    };
  });

  if (pageMeds.length > lineMeds.length) {
    merged.push(...pageMeds.slice(lineMeds.length));
  }

  return merged;
}

function extractionQualityScore(medications: MedicationEntry[]): number {
  if (medications.length === 0) return 0;

  let score = 0;

  for (const med of medications) {
    if (isMissingText(med.name)) continue;

    score += 2;

    const match = fuzzyMatchDrugName(med.name);
    if (match) {
      if (match.score >= 0.9) score += 2;
      else if (match.score >= 0.82) score += 1.4;
      else if (match.score >= 0.72) score += 0.8;
    }

    if (!isMissingText(med.dosage)) score += 0.4;
    if (!isMissingText(med.frequency)) score += 0.4;
    if (!isMissingText(med.route)) score += 0.2;

    if (/[/|,;+]/.test(med.name)) score -= 0.6;
    if (med.name.trim().length <= 2) score -= 0.8;
  }

  return Math.max(0, score);
}

function isWeakMedicationExtraction(medications: MedicationEntry[]): boolean {
  if (medications.length === 0) return true;
  const avgScore = extractionQualityScore(medications) / medications.length;
  return avgScore < 2.6;
}

function chooseBestExtraction(primary: MedicationEntry[], fallback: MedicationEntry[]): MedicationEntry[] {
  const primaryScore = extractionQualityScore(primary);
  const fallbackScore = extractionQualityScore(fallback);
  return fallbackScore > primaryScore + 0.4 ? fallback : primary;
}

function applyFuzzyMedicationCorrection(medications: MedicationEntry[]): MedicationEntry[] {
  return medications.map((med) => {
    const match = fuzzyMatchDrugName(med.name);
    if (!match) return med;

    const normalizedName = med.name.trim();
    const hasCompoundDelimiter = /[/|,;+]/.test(normalizedName);
    const tokenCount = normalizedName.split(/\s+/).filter(Boolean).length;
    const normalizedOriginal = normalizedName.toLowerCase().replace(/[^a-z0-9]/g, "");
    const normalizedMatched = match.matchedTerm.toLowerCase().replace(/[^a-z0-9]/g, "");
    const alreadyEquivalent = normalizedOriginal === normalizedMatched;

    // Keep correction conservative to avoid replacing genuine handwritten content with a guessed drug.
    const shouldCorrect =
      !hasCompoundDelimiter &&
      !alreadyEquivalent &&
      ((tokenCount <= 1 && match.score >= 0.9) || (tokenCount > 1 && match.score >= 0.93));
    const shouldAttachCategory = match.score >= 0.82;

    if (!shouldCorrect && !shouldAttachCategory) return med;

    return {
      ...med,
      name: shouldCorrect ? toTitleCase(match.matchedTerm) : med.name,
      category: shouldAttachCategory ? match.category : med.category,
    };
  });
}

function dedupeMedications(medications: MedicationEntry[]): MedicationEntry[] {
  const seen = new Set<string>();
  const output: MedicationEntry[] = [];

  for (const med of medications) {
    const key = med.name.trim().toLowerCase();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    output.push(med);
  }

  return output;
}

async function extractMedicationFromLine(
  lineFile: File,
  lineNumber: number,
  totalLines: number,
): Promise<MedicationEntry | null> {
  const parts: GeminiPart[] = [
    { text: buildLineExtractionPrompt(lineNumber, totalLines) },
    { text: `Prescription snippet line ${lineNumber}/${totalLines}` },
    await fileToInlinePart(lineFile),
  ];

  const payload = await generateWithGemini(parts, {
    task: "extraction",
    systemInstruction: STRICT_EXTRACTION_SYSTEM_INSTRUCTION,
    responseSchema: LINE_EXTRACTION_SCHEMA,
    temperature: 0,
    preferredModels: [GEMINI_EXTRACTION_MODEL, ...DEFAULT_EXTRACTION_MODEL_FALLBACKS],
  });
  const rawText = extractResponseText(payload);
  const parsed = extractJsonPayload(rawText);
  const medications = normalizeExtractionPayload(parsed);

  if (medications.length === 0) return null;
  return medications[0];
}

async function extractTranscriptionLinesFromImage(
  imageFile: File,
  patient: PatientData,
  focusHint?: string,
): Promise<string[]> {
  const parts: GeminiPart[] = [
    { text: buildTranscriptionPrompt(patient) },
    {
      text:
        focusHint?.trim() ||
        "Transcribe all visible handwritten lines with line numbers. Prioritize medication lines.",
    },
    await fileToInlinePart(imageFile),
  ];

  const payload = await generateWithGemini(parts, {
    task: "extraction",
    systemInstruction: CLINICAL_EXTRACTION_SYSTEM_INSTRUCTION,
    responseSchema: TRANSCRIPTION_SCHEMA,
    temperature: 0,
    preferredModels: [GEMINI_EXTRACTION_RESCUE_MODEL, GEMINI_EXTRACTION_MODEL, ...DEFAULT_EXTRACTION_MODEL_FALLBACKS],
  });
  const rawText = extractResponseText(payload);
  const parsed = extractJsonPayload(rawText);
  return normalizeTranscriptionLines(parsed);
}

type PageExtractionStrategy = "strict" | "clinical_recovery";

async function extractFromEnhancedPage(
  enhancedFile: File,
  patient: PatientData,
  strategy: PageExtractionStrategy,
  focusHint?: string,
): Promise<MedicationEntry[]> {
  const prompt =
    strategy === "clinical_recovery" ? buildClinicalRecoveryPrompt(patient) : buildFullPageExtractionPrompt();
  const systemInstruction =
    strategy === "clinical_recovery"
      ? CLINICAL_EXTRACTION_SYSTEM_INSTRUCTION
      : STRICT_EXTRACTION_SYSTEM_INSTRUCTION;
  const preferredModels =
    strategy === "clinical_recovery"
      ? [GEMINI_EXTRACTION_RESCUE_MODEL, GEMINI_EXTRACTION_MODEL, ...DEFAULT_EXTRACTION_MODEL_FALLBACKS]
      : [GEMINI_EXTRACTION_MODEL, ...DEFAULT_EXTRACTION_MODEL_FALLBACKS];

  const parts: GeminiPart[] = [
    { text: prompt },
    {
      text:
        focusHint?.trim() ||
        "Prescription image for medication extraction. Focus on written medicine lines if present.",
    },
    await fileToInlinePart(enhancedFile),
  ];

  const payload = await generateWithGemini(parts, {
    task: "extraction",
    systemInstruction,
    responseSchema: PAGE_EXTRACTION_SCHEMA,
    temperature: 0,
    preferredModels,
  });
  const rawText = extractResponseText(payload);
  const parsed = extractJsonPayload(rawText);
  return normalizeExtractionPayload(parsed);
}

async function extractFromPreparedPrescription(
  prepared: { enhancedFile: File; lineFiles: File[] },
  patient: PatientData,
): Promise<MedicationEntry[]> {
  const primaryStrategy: PageExtractionStrategy = CLINICAL_FIRST_EXTRACTION ? "clinical_recovery" : "strict";
  const secondaryStrategy: PageExtractionStrategy = primaryStrategy === "clinical_recovery" ? "strict" : "clinical_recovery";

  let pageMedsPrimary: MedicationEntry[] = [];
  try {
    pageMedsPrimary = await extractFromEnhancedPage(prepared.enhancedFile, patient, primaryStrategy);
  } catch (error) {
    if (isRateLimitOrQuotaError(error)) {
      throw error;
    }
    // Keep primary extraction empty and continue with fallback strategy.
  }

  let correctedPage = dedupeMedications(applyFuzzyMedicationCorrection(pageMedsPrimary));

  if (isWeakMedicationExtraction(correctedPage)) {
    try {
      const pageMedsSecondary = await extractFromEnhancedPage(
        prepared.enhancedFile,
        patient,
        secondaryStrategy,
      );
      const correctedSecondary = dedupeMedications(applyFuzzyMedicationCorrection(pageMedsSecondary));
      correctedPage = chooseBestExtraction(correctedPage, correctedSecondary);
    } catch (error) {
      if (isRateLimitOrQuotaError(error)) {
        throw error;
      }
      // Ignore fallback failure and continue with primary extraction output.
    }
  }

  const shouldRunDeepExtraction =
    ENABLE_DEEP_EXTRACTION_ALWAYS ||
    (ENABLE_DEEP_EXTRACTION_AUTO && (correctedPage.length === 0 || isWeakMedicationExtraction(correctedPage)));

  if (!shouldRunDeepExtraction && correctedPage.length > 0) {
    return correctedPage;
  }

  let deduped: MedicationEntry[];
  if (shouldRunDeepExtraction) {
    const lineResults = await Promise.all(
      prepared.lineFiles.map(async (lineFile, index) => {
        try {
          return await extractMedicationFromLine(lineFile, index + 1, prepared.lineFiles.length);
        } catch (error) {
          if (isRateLimitOrQuotaError(error)) {
            throw error;
          }
          return null;
        }
      }),
    );

    const lineMeds: MedicationEntry[] = [];
    for (const med of lineResults) {
      if (med && !isMissingText(med.name)) {
        lineMeds.push(med);
      }
    }

    const combined = mergeMedicationLists(lineMeds, correctedPage);
    deduped = dedupeMedications(applyFuzzyMedicationCorrection(combined));
  } else {
    deduped = correctedPage;
  }

  if (deduped.length > 0) {
    if (isWeakMedicationExtraction(deduped) && correctedPage.length > 0) {
      return chooseBestExtraction(deduped, correctedPage);
    }
    return deduped;
  }

  if (correctedPage.length > 0) {
    return correctedPage;
  }

  return [];
}

async function extractPrescriptionMedications(
  prescriptionFile: File,
  patient: PatientData,
): Promise<MedicationEntry[]> {
  const fallbackErrors: string[] = [];
  const includeLineSplits = ENABLE_DEEP_EXTRACTION_ALWAYS || ENABLE_DEEP_EXTRACTION_AUTO;

  const preparedPrimary = await preprocessAndSplitPrescription(
    prescriptionFile,
    includeLineSplits && !USE_FAST_OCR,
  );
  const primary = await extractFromPreparedPrescription(preparedPrimary, patient);
  if (primary.length > 0) {
    return primary;
  }

  if (USE_FAST_OCR) {
    // Auto-upgrade to an accurate extraction pass if fast mode failed.
    const preparedAccurate = await preprocessAndSplitPrescription(
      prescriptionFile,
      includeLineSplits,
    );
    const accurate = await extractFromPreparedPrescription(preparedAccurate, patient);
    if (accurate.length > 0) {
      return accurate;
    }
  }

  if (ENABLE_HEAVY_RECOVERY) {
    // Last recovery pass on original image (no preprocessing), focused on likely medication area.
    try {
      const originalRecovery = dedupeMedications(
        applyFuzzyMedicationCorrection(
          await extractFromEnhancedPage(
            prescriptionFile,
            patient,
            "clinical_recovery",
            "Original prescription image. Focus on medicine names near the lower half of the page and return best plausible medications.",
          ),
        ),
      );
      if (originalRecovery.length > 0) {
        return originalRecovery;
      }
    } catch (error) {
      if (isRateLimitOrQuotaError(error)) {
        throw error;
      }
      fallbackErrors.push(error instanceof Error ? error.message : "Original image clinical recovery failed.");
    }

    // Transcription-first fallback: read lines, then run local drug matching.
    try {
      const transcriptionLines = await extractTranscriptionLinesFromImage(
        preparedPrimary.enhancedFile,
        patient,
        "Transcribe every handwritten line. Focus on medicine names near the bottom area.",
      );
      const inferredMeds = dedupeMedications(applyFuzzyMedicationCorrection(inferMedicationsFromTranscribedLines(transcriptionLines)));
      if (inferredMeds.length > 0) {
        return inferredMeds;
      }
    } catch (error) {
      if (isRateLimitOrQuotaError(error)) {
        throw error;
      }
      fallbackErrors.push(error instanceof Error ? error.message : "Transcription fallback failed.");
    }

    // Region-focused fallback: crop the lower half where medication names are usually written.
    try {
      const lowerHalf = await cropPrescriptionRegion(prescriptionFile, 0.45, 1);
      if (lowerHalf) {
        const lowerPrepared = await preprocessAndSplitPrescription(lowerHalf, true);
        const lowerExtracted = await extractFromPreparedPrescription(lowerPrepared, patient);
        if (lowerExtracted.length > 0) {
          return lowerExtracted;
        }

        const lowerLines = await extractTranscriptionLinesFromImage(
          lowerHalf,
          patient,
          "Lower section crop. Transcribe and prioritize medication lines only.",
        );
        const lowerInferred = dedupeMedications(
          applyFuzzyMedicationCorrection(inferMedicationsFromTranscribedLines(lowerLines)),
        );
        if (lowerInferred.length > 0) {
          return lowerInferred;
        }
      }
    } catch (error) {
      if (isRateLimitOrQuotaError(error)) {
        throw error;
      }
      fallbackErrors.push(error instanceof Error ? error.message : "Lower-half fallback failed.");
    }
  }

  const fallbackMessage = fallbackErrors.find((msg) => msg && msg.trim().length > 0);
  if (fallbackMessage) {
    throw new Error(`Could not reliably extract medications from the prescription image. ${fallbackMessage}`);
  }

  throw new Error("Could not reliably extract medications from the prescription image.");
}

function buildValidationPrompt(
  input: AnalyzeInput,
  prescriptionMedsForValidation: ManualMedication[],
  extractedFromImage: MedicationEntry[],
): string {
  const patientContext = {
    name: input.patient.name,
    age: input.patient.age,
    gender: input.patient.gender,
    weightKg: input.patient.weight,
    bloodGroup: input.patient.bloodGroup,
    allergies: input.patient.allergies,
    conditions: input.patient.conditions,
  };

  const medicationSource =
    prescriptionMedsForValidation.length > 0
      ? prescriptionMedsForValidation
      : "No medication list available.";

  const customInstructions = input.instructions.trim() || "No extra instructions provided.";
  const sourceSummary = {
    reportFileAttached: Boolean(input.reportFile),
    prescriptionFileAttached: Boolean(input.prescriptionFile),
    manualMedicationListProvided: prescriptionMedsForValidation.length > 0,
    extractedMedicationCount: extractedFromImage.length,
  };
  const categoryHints = extractedFromImage
    .filter((med) => med.category)
    .map((med) => ({ name: med.name, category: med.category }));

  return `You are assisting a busy doctor.
Be concise, decisive, and clinically safe.
Use all available sources together: report file, prescription file, medication list, patient profile.
Goal: validate each dose and decide KEEP, INCREASE, DECREASE, STOP, or CLARIFY.

Clinical rules:
- Prioritize contraindications and safety first.
- Use report findings plus age, sex, weight, allergies, and comorbidities.
- If details are incomplete, use action="clarify" with specific missing data.
- Keep answers short and practical.
- Use medication category hints when available.
- Example safety heuristics:
  - NSAID + CKD/gastritis/ulcer risk => caution or danger.
  - Antidiabetic + hypoglycemia risk/poor intake => caution.
  - Antihypertensive + hypotension/dehydration clues => caution.
  - Antibiotic choice should align with likely infection context.

Return ONLY valid JSON with this exact shape:
{
  "medications": [
    {
      "name": "string",
      "dosage": "string",
      "frequency": "string",
      "route": "string",
      "confidence": "high | medium | low"
    }
  ],
  "validations": [
    {
      "medication": "string",
      "status": "safe | caution | danger",
      "action": "keep | increase | decrease | stop | clarify",
      "message": "short clinical reason (max 25 words)",
      "adjustment": "specific next step/dose change (max 18 words)"
    }
  ],
  "reasoning": "- bullet 1\\n- bullet 2\\n- bullet 3 (max 5 bullets total)"
}

Status meaning:
- safe: dose is appropriate
- caution: dose may need adjustment/monitoring
- danger: contraindicated/high risk

Source summary:
${JSON.stringify(sourceSummary, null, 2)}

Patient profile:
${JSON.stringify(patientContext, null, 2)}

Prescription medications to validate:
${JSON.stringify(medicationSource, null, 2)}

Normalized medication context:
${JSON.stringify(extractedFromImage, null, 2)}

Category hints from fuzzy matching:
${JSON.stringify(categoryHints, null, 2)}

User instructions:
${customInstructions}`;
}

function coerceVerdict(payload: unknown): VerdictData {
  if (!payload || typeof payload !== "object") {
    throw new Error("Model returned an invalid payload.");
  }

  const record = payload as Record<string, unknown>;
  const medications = normalizeMedications(record.medications);
  const validations = normalizeValidations(record.validations);
  const reasoning = String(record.reasoning ?? "").trim();

  if (medications.length === 0 && validations.length === 0) {
    throw new Error("No medications or validation results were returned.");
  }

  return {
    medications,
    validations,
    reasoning:
      reasoning ||
      "Reasoning was not provided by the model. Review medication and validation cards above.",
  };
}

export async function analyzePrescriptionWithGemini(input: AnalyzeInput): Promise<VerdictData> {
  if (!GEMINI_API_KEY) {
    throw new Error("Gemini API key missing. Set VITE_GEMINI_API_KEY in .env.local.");
  }

  const normalizedManualMeds: MedicationEntry[] = dedupeMedications(
    applyFuzzyMedicationCorrection(
      input.manualMedications.map((med) => ({
        name: med.name,
        dosage: med.dosage || "Not specified",
        frequency: med.frequency || "Not specified",
        route: med.route || "Not specified",
      })),
    ),
  );

  let extractedFromImage: MedicationEntry[] = [];
  if (input.prescriptionFile && input.manualMedications.length === 0) {
    extractedFromImage = await extractPrescriptionMedications(input.prescriptionFile, input.patient);
  }

  const medicationContextForPrompt =
    input.manualMedications.length > 0 ? normalizedManualMeds : extractedFromImage;

  const prescriptionMedsForValidation: ManualMedication[] =
    input.manualMedications.length > 0
      ? normalizedManualMeds.map((med) => ({
          name: med.name,
          dosage: med.dosage,
          frequency: med.frequency,
          route: med.route,
        }))
      : extractedFromImage.map((med) => ({
          name: med.name,
          dosage: med.dosage,
          frequency: med.frequency,
          route: med.route,
        }));

  const parts: GeminiPart[] = [
    { text: buildValidationPrompt(input, prescriptionMedsForValidation, medicationContextForPrompt) },
  ];

  if (input.reportFile) {
    parts.push({ text: `Lab/diagnostic report file: ${input.reportFile.name}` });
    parts.push(await fileToInlinePart(input.reportFile));
  }

  if (input.prescriptionFile) {
    parts.push({ text: `Current prescription file: ${input.prescriptionFile.name}` });
    parts.push(await fileToInlinePart(input.prescriptionFile));
  }

  const payload = await generateWithGemini(parts, {
    task: "validation",
    systemInstruction: VALIDATION_SYSTEM_INSTRUCTION,
    temperature: 0,
    preferredModels: [GEMINI_VALIDATION_MODEL, ...DEFAULT_VALIDATION_MODEL_FALLBACKS],
  });
  const rawText = extractResponseText(payload);
  const parsed = extractJsonPayload(rawText);
  const verdict = coerceVerdict(parsed);

  if (input.manualMedications.length === 0 && extractedFromImage.length > 0) {
    verdict.medications = extractedFromImage;
  } else if (input.manualMedications.length > 0 && normalizedManualMeds.length > 0) {
    verdict.medications = normalizedManualMeds;
  }

  return verdict;
}
