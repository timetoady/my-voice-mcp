import { readFile } from "node:fs/promises";
import path from "node:path";

import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";

import { UnsupportedSourceError } from "../domain/errors.js";
import type { ValidationResult } from "../domain/types.js";
import { estimateTokens, normalizeWhitespace } from "./text.js";

export interface ExtractedPdf {
  fileName: string;
  buffer: Buffer;
  pageCount: number;
  text: string;
}

export async function extractPdfText(pdfPath: string): Promise<ExtractedPdf> {
  if (!pdfPath.toLowerCase().endsWith(".pdf")) {
    throw new UnsupportedSourceError("Only PDF sources are supported in the MVP.");
  }

  const buffer = await readFile(pdfPath);
  let pageCount = 0;
  let text = "";

  try {
    const loadingTask = getDocument({
      data: new Uint8Array(buffer),
      useSystemFonts: true
    });
    const document = await loadingTask.promise;
    pageCount = document.numPages;

    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= document.numPages; pageNumber += 1) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      const pageText = content.items
        .map((item) => ("str" in item ? item.str : ""))
        .join(" ");
      pages.push(pageText);
    }

    text = normalizeWhitespace(pages.join("\n\n"));
  } catch (error) {
    throw new UnsupportedSourceError(
      `Unable to parse the PDF or extract text from it. The MVP currently supports text-based PDFs only. ${
        error instanceof Error ? `Parser detail: ${error.message}` : ""
      }`.trim()
    );
  }

  return {
    fileName: path.basename(pdfPath),
    buffer,
    pageCount,
    text
  };
}

export async function validatePdfSource(pdfPath: string): Promise<ValidationResult> {
  let extracted: ExtractedPdf;
  try {
    extracted = await extractPdfText(pdfPath);
  } catch (error) {
    return {
      supported: false,
      reason: error instanceof Error ? error.message : "Unable to parse the PDF source.",
      warnings: []
    };
  }

  const warnings: string[] = [];

  if (!extracted.text.trim()) {
    return {
      supported: false,
      reason: "No extractable text was found. Image-only or scanned PDFs are not supported in the MVP.",
      warnings
    };
  }

  if (extracted.text.length < 2500) {
    warnings.push("Short sample detected. More text will produce a more stable voice guide.");
  }

  return {
    supported: true,
    warnings,
    stats: {
      fileName: extracted.fileName,
      pageCount: extracted.pageCount,
      extractedCharacters: extracted.text.length,
      estimatedTokens: estimateTokens(extracted.text)
    }
  };
}
