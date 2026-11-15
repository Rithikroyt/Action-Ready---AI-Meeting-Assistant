import { describe, expect, it } from "vitest";
import { docxXmlToText, docxToText, extractNotesFile, fileKind, readZipEntry, tidyText, FILE_LIMITS } from "@/lib/notesFile";

// Minimal zip writer (local headers + central directory) so tests use real archives, stored or deflated.
async function deflateRaw(data: Uint8Array) {
  const s = new Blob([data as BlobPart]).stream().pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(s).arrayBuffer());
}
async function makeZip(entries: Record<string, string>, deflate: boolean) {
  const enc = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const raw = enc.encode(content);
    const body = deflate ? await deflateRaw(raw) : raw;
    const nameB = enc.encode(name);
    const local = new Uint8Array(30 + nameB.length);
    const dv = new DataView(local.buffer);
    dv.setUint32(0, 0x04034b50, true);
    dv.setUint16(8, deflate ? 8 : 0, true);
    dv.setUint32(18, body.length, true);
    dv.setUint32(22, raw.length, true);
    dv.setUint16(26, nameB.length, true);
    local.set(nameB, 30);
    const cd = new Uint8Array(46 + nameB.length);
    const cv = new DataView(cd.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, deflate ? 8 : 0, true);
    cv.setUint32(20, body.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameB.length, true);
    cv.setUint32(42, offset, true);
    cd.set(nameB, 46);
    parts.push(local, body);
    central.push(cd);
    offset += local.length + body.length;
  }
  const cdSize = central.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const all = [...parts, ...central, eocd];
  const out = new Uint8Array(all.reduce((n, a) => n + a.length, 0));
  let p = 0;
  for (const a of all) {
    out.set(a, p);
    p += a.length;
  }
  return out;
}

const DOC_XML = `<?xml version="1.0"?><w:document xmlns:w="x"><w:body>
<w:p><w:r><w:t>Weekly sync &amp; planning</w:t></w:r></w:p>
<w:p><w:pPr><w:numPr><w:ilvl w:val="0"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">Priya to draft </w:t></w:r><w:r><w:t>the Q3 report by Friday (4h)</w:t></w:r></w:p>
<w:p><w:r><w:t>Owner:</w:t></w:r><w:r><w:tab/><w:t>Marco</w:t></w:r><w:r><w:br/><w:t>Second line</w:t></w:r></w:p>
<w:p><w:del><w:r><w:delText>removed words</w:delText></w:r></w:del><w:r><w:t>Kept &lt;text&gt; &#8212; done</w:t></w:r></w:p>
<w:p/>
</w:body></w:document>`;

describe("notes file extraction (browser-side, file never uploaded)", () => {
  it("recognises only .txt, .docx and .pdf", () => {
    expect(fileKind("Notes.TXT")).toBe("txt");
    expect(fileKind("minutes.docx")).toBe("docx");
    expect(fileKind("minutes.pdf")).toBe("pdf");
    for (const n of ["call.mp3", "call.mp4", "old.doc", "notes.txt.exe", "pdf"]) expect(fileKind(n)).toBeNull();
  });

  it("tidies whitespace without losing paragraph breaks", () => {
    expect(tidyText("a  \r\nb\r\n\r\n\r\n\r\nc d  ")).toBe("a\nb\n\nc d");
  });

  it("converts WordprocessingML: paragraphs, lists, tabs, breaks, entities; drops tracked deletions", () => {
    expect(docxXmlToText(DOC_XML)).toBe("Weekly sync & planning\n- Priya to draft the Q3 report by Friday (4h)\nOwner:\tMarco\nSecond line\nKept <text> — done");
  });

  it.each([false, true])("reads word/document.xml from a real zip (deflated=%s)", async (deflate) => {
    const zip = await makeZip({ "[Content_Types].xml": "<Types/>", "word/document.xml": DOC_XML }, deflate);
    expect(new TextDecoder().decode((await readZipEntry(zip, "word/document.xml"))!)).toBe(DOC_XML);
    expect(await readZipEntry(zip, "word/missing.xml")).toBeNull();
    expect(await docxToText(zip)).toContain("Priya to draft the Q3 report");
  });

  it("extracts a .docx File end to end", async () => {
    const zip = await makeZip({ "word/document.xml": DOC_XML }, true);
    const r = await extractNotesFile(new File([zip as BlobPart], "Sync.docx"));
    expect(r).toMatchObject({ ok: true, kind: "docx" });
    if (r.ok) expect(r.text.startsWith("Weekly sync & planning")).toBe(true);
  });

  it("refuses a file that is not really a .docx (e.g. a renamed .doc)", async () => {
    const r = await extractNotesFile(new File(["not a zip"], "old.docx"));
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/save as \.docx/);
  });

  it("loads .txt and keeps the old 64 KB limit", async () => {
    expect(await extractNotesFile(new File(["Priya owns the report, due Friday."], "n.txt"))).toEqual({ ok: true, kind: "txt", text: "Priya owns the report, due Friday.", pages: undefined });
    const big = await extractNotesFile(new File(["x".repeat(FILE_LIMITS.txt + 1)], "big.txt"));
    expect(big.ok).toBe(false);
  });

  it("refuses recordings and other formats with a clear message", async () => {
    for (const n of ["meeting.mp3", "meeting.mp4"]) {
      const r = await extractNotesFile(new File([new Uint8Array(10)], n));
      expect(r.ok).toBe(false);
      if (!r.ok) expect(r.message).toMatch(/Recordings \(\.mp3, \.mp4\) are not supported/);
    }
  });

  it("never truncates: over-limit text is refused, empty files are refused", async () => {
    const long = await extractNotesFile(new File(["word ".repeat(2500)], "long.txt"));
    expect(long.ok).toBe(false);
    if (!long.ok) expect(long.message).toMatch(/Nothing was truncated/);
    const empty = await extractNotesFile(new File(["   \n "], "empty.txt"));
    expect(empty).toEqual({ ok: false, message: "The file is empty." });
  });

  it("refuses oversized .docx / .pdf before reading them", async () => {
    const huge = new File([new Uint8Array(FILE_LIMITS.pdf + 1)], "scan.pdf");
    const r = await extractNotesFile(huge);
    expect(r).toEqual({ ok: false, message: "That .pdf file is larger than 10 MB." });
  });
});
