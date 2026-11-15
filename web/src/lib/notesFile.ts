// Turns an uploaded notes file (.txt, .docx, .pdf) into plain text, entirely in the browser.
// The file is never uploaded: only the extracted text goes into the notes box, where the user reviews it
// before anything is submitted. Nothing is truncated — over-limit text is refused, like typed notes.
import { MAX_CHARS } from "./preflight";

export const NOTES_FILE_ACCEPT =
  ".txt,.docx,.pdf,text/plain,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/pdf";

export const FILE_LIMITS = { txt: 64 * 1024, docx: 5 * 1024 * 1024, pdf: 10 * 1024 * 1024 } as const;
export type NotesFileKind = keyof typeof FILE_LIMITS;

export type ExtractResult = { ok: true; text: string; kind: NotesFileKind; pages?: number } | { ok: false; message: string };

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

export function fileKind(name: string): NotesFileKind | null {
  const m = /\.(txt|docx|pdf)$/i.exec(name.trim());
  return m ? (m[1]!.toLowerCase() as NotesFileKind) : null;
}

/** Collapse whitespace the way a person would paste it: keep paragraph breaks, drop runs of blank lines. */
export function tidyText(s: string): string {
  return s
    .replace(/\r\n?/g, "\n")
    .replace(/ /g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

// ---------- .docx: a zip; the body text lives in word/document.xml ----------

function u16(b: Uint8Array, o: number) {
  return b[o]! | (b[o + 1]! << 8);
}
function u32(b: Uint8Array, o: number) {
  return (b[o]! | (b[o + 1]! << 8) | (b[o + 2]! << 16) | (b[o + 3]! << 24)) >>> 0;
}

async function inflateRaw(data: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([data as BlobPart]).stream().pipeThrough(new DecompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Reads one entry from a zip archive (stored or deflated). Returns null if absent or unsupported. */
export async function readZipEntry(zip: Uint8Array, wanted: string): Promise<Uint8Array | null> {
  // End-of-central-directory record: scan backwards (it may be followed by a comment of up to 64 KB).
  let eocd = -1;
  for (let i = zip.length - 22; i >= Math.max(0, zip.length - 22 - 65535); i--) {
    if (u32(zip, i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) return null;
  const count = u16(zip, eocd + 10);
  let p = u32(zip, eocd + 16);
  const dec = new TextDecoder();
  for (let n = 0; n < count && p + 46 <= zip.length; n++) {
    if (u32(zip, p) !== 0x02014b50) return null;
    const method = u16(zip, p + 10);
    const csize = u32(zip, p + 20);
    const nameLen = u16(zip, p + 28);
    const extraLen = u16(zip, p + 30);
    const commentLen = u16(zip, p + 32);
    const local = u32(zip, p + 42);
    const name = dec.decode(zip.subarray(p + 46, p + 46 + nameLen));
    if (name === wanted) {
      if (u32(zip, local) !== 0x04034b50) return null;
      const start = local + 30 + u16(zip, local + 26) + u16(zip, local + 28);
      const body = zip.subarray(start, start + csize);
      if (method === 0) return body;
      if (method === 8) return inflateRaw(body);
      return null;
    }
    p += 46 + nameLen + extraLen + commentLen;
  }
  return null;
}

const XML_ENTITIES: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'" };
function decodeXml(s: string) {
  return s.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_, e: string) =>
    e[0] === "#" ? String.fromCodePoint(e[1] === "x" || e[1] === "X" ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)) : (XML_ENTITIES[e.toLowerCase()] ?? ""),
  );
}

/** WordprocessingML → text: one line per paragraph, tabs and line breaks kept, list items prefixed with "- ". */
export function docxXmlToText(xml: string): string {
  const body = xml.replace(/<w:(?:del|instrText)\b[\s\S]*?<\/w:(?:del|instrText)>/g, ""); // tracked deletions, field codes
  const paras = body.match(/<w:p[\s>][\s\S]*?<\/w:p>|<w:p\/>/g) ?? [];
  const lines = paras.map((p) => {
    const isList = /<w:numPr>/.test(p);
    let line = "";
    for (const m of p.matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>|<w:tab\/>|<w:br\/>|<w:cr\/>/g)) {
      if (m[1] !== undefined) line += decodeXml(m[1]);
      else line += m[0] === "<w:tab/>" ? "\t" : "\n";
    }
    return isList && line.trim() ? `- ${line}` : line;
  });
  return tidyText(lines.join("\n"));
}

export async function docxToText(bytes: Uint8Array): Promise<string | null> {
  const doc = await readZipEntry(bytes, "word/document.xml");
  return doc ? docxXmlToText(new TextDecoder().decode(doc)) : null;
}

// ---------- .pdf: pdf.js, loaded only when a PDF is picked ----------

async function pdfToText(bytes: Uint8Array): Promise<{ text: string; pages: number }> {
  const pdfjs = await import("pdfjs-dist");
  pdfjs.GlobalWorkerOptions.workerSrc = new URL("pdfjs-dist/build/pdf.worker.min.mjs", import.meta.url).toString();
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  try {
    const out: string[] = [];
    for (let i = 1; i <= doc.numPages; i++) {
      const page = await doc.getPage(i);
      const content = await page.getTextContent();
      let line = "";
      for (const item of content.items) {
        if (!("str" in item)) continue;
        line += item.str;
        if (item.hasEOL) line += "\n";
      }
      out.push(line);
    }
    return { text: tidyText(out.join("\n\n")), pages: doc.numPages };
  } finally {
    await task.destroy();
  }
}

// ---------- entry point ----------

export async function extractNotesFile(file: File): Promise<ExtractResult> {
  const kind = fileKind(file.name);
  if (!kind) return { ok: false, message: "Supported files: .txt, .docx and .pdf. Recordings (.mp3, .mp4) are not supported." };
  if (file.size > FILE_LIMITS[kind])
    return { ok: false, message: `That .${kind} file is larger than ${kind === "txt" ? "64 KB" : mb(FILE_LIMITS[kind])}.` };

  let text: string;
  let pages: number | undefined;
  try {
    if (kind === "txt") text = tidyText(await file.text());
    else {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (kind === "docx") {
        const t = await docxToText(bytes);
        if (t === null) return { ok: false, message: "This doesn't look like a Word .docx file (older .doc files aren't supported — save as .docx)." };
        text = t;
      } else {
        const r = await pdfToText(bytes);
        text = r.text;
        pages = r.pages;
      }
    }
  } catch (e) {
    const pw = e && typeof e === "object" && "name" in e && (e as { name: string }).name === "PasswordException";
    return { ok: false, message: pw ? "This PDF is password-protected. Remove the password and try again." : `The .${kind} file could not be read.` };
  }

  if (!text.trim())
    return {
      ok: false,
      message: kind === "pdf" ? "No selectable text found — this PDF is probably a scan. Scanned PDFs (OCR) aren't supported." : "The file is empty.",
    };
  if (text.length > MAX_CHARS)
    return { ok: false, message: `The file has ${text.length.toLocaleString()} characters of text; the limit is ${MAX_CHARS.toLocaleString()}. Nothing was truncated.` };
  return { ok: true, text, kind, pages };
}
