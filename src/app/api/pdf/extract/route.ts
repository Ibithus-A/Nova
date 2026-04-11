import path from "node:path";
import { pathToFileURL } from "node:url";

import { NextResponse } from "next/server";
import {
  FormatError,
  InvalidPDFException,
  PasswordException,
  PDFParse,
  UnknownErrorException,
} from "pdf-parse";
import { createWorker } from "tesseract.js";

export const runtime = "nodejs";

const OCR_MAX_PAGES = 6;
const OCR_MIN_TEXT_LENGTH = 160;
const OCR_CACHE_PATH = "/tmp/tesseract-cache";
const PDFJS_WORKER_SRC = pathToFileURL(
  path.join(process.cwd(), "node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs"),
).href;

let pdfWorkerConfigured = false;

function cleanExtractedText(text: string) {
  return text.replace(/\s+\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function ensurePdfWorker() {
  if (pdfWorkerConfigured) {
    return;
  }

  PDFParse.setWorker(PDFJS_WORKER_SRC);
  pdfWorkerConfigured = true;
}

function shouldUseOcr(text: string) {
  return text.trim().length < OCR_MIN_TEXT_LENGTH;
}

async function extractTextWithOcr(parser: PDFParse, totalPages: number) {
  const screenshotResult = await parser.getScreenshot({
    first: Math.min(totalPages, OCR_MAX_PAGES),
    desiredWidth: 1600,
    imageBuffer: true,
    imageDataUrl: false,
  });

  const worker = await createWorker("eng", 1, {
    cachePath: OCR_CACHE_PATH,
  });

  try {
    const pageTexts: string[] = [];

    for (const page of screenshotResult.pages) {
      const imageBuffer = Buffer.from(page.data);
      const result = await worker.recognize(imageBuffer);
      const text = cleanExtractedText(result.data.text || "");

      if (text) {
        pageTexts.push(`Page ${page.pageNumber}\n${text}`);
      }
    }

    return cleanExtractedText(pageTexts.join("\n\n"));
  } finally {
    await worker.terminate();
  }
}

export async function POST(request: Request) {
  let parser: PDFParse | null = null;

  try {
    const formData = await request.formData();
    const file = formData.get("file");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "A PDF file is required." }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }

    const arrayBuffer = await file.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    ensurePdfWorker();
    parser = new PDFParse({ data: buffer });
    const result = await parser.getText();
    const directText = cleanExtractedText(result.text || "");
    let text = directText;
    let extractionMode: "text" | "ocr" | "hybrid" = "text";

    if (shouldUseOcr(directText)) {
      const ocrText = await extractTextWithOcr(parser, result.total);

      if (ocrText) {
        text = directText
          ? cleanExtractedText(`${directText}\n\n${ocrText}`)
          : ocrText;
        extractionMode = directText ? "hybrid" : "ocr";
      }
    }

    if (!text) {
      return NextResponse.json(
        {
          error:
            "No readable text was found in this PDF. It may be image-only or scanned, which would require OCR support.",
        },
        { status: 422 },
      );
    }

    return NextResponse.json({
      fileName: file.name,
      pageCount: result.total,
      text,
      extractionMode,
    });
  } catch (error) {
    if (error instanceof PasswordException) {
      return NextResponse.json(
        { error: "This PDF is password-protected and cannot be read yet." },
        { status: 422 },
      );
    }

    if (error instanceof InvalidPDFException || error instanceof FormatError) {
      return NextResponse.json(
        { error: "This file does not appear to be a valid readable PDF." },
        { status: 422 },
      );
    }

    if (error instanceof UnknownErrorException && error.message) {
      return NextResponse.json(
        { error: `The PDF could not be processed: ${error.message}` },
        { status: 422 },
      );
    }

    if (error instanceof Error && error.message) {
      return NextResponse.json(
        { error: `The PDF could not be processed: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json(
      { error: "The PDF could not be processed." },
      { status: 500 },
    );
  } finally {
    await parser?.destroy();
  }
}
