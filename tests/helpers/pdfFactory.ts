import PDFDocument from "pdfkit";

function renderPdf(lines: string[]): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const document = new PDFDocument({
      autoFirstPage: true,
      compress: false,
      margin: 50,
      size: "LETTER"
    });
    const chunks: Buffer[] = [];

    document.on("data", (chunk: Buffer) => {
      chunks.push(chunk);
    });
    document.on("end", () => {
      resolve(Buffer.concat(chunks));
    });
    document.on("error", reject);

    for (const line of lines) {
      document.text(line, {
        paragraphGap: 10
      });
    }

    document.end();
  });
}

export async function createTextPdf(lines: string[]): Promise<Uint8Array> {
  return renderPdf(lines);
}

export async function createBlankPdf(): Promise<Uint8Array> {
  return renderPdf([" "]);
}
