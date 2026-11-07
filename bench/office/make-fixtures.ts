// Office spike (M8): writes the test documents to bench/office/fixtures/ (gitignored).
// All text is written here and the picture is drawn here, so the files are licence-clean.
//   node bench/office/make-fixtures.ts
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import * as mupdf from "mupdf";
import {
  AlignmentType,
  Document,
  ExternalHyperlink,
  Footer,
  FootnoteReferenceRun,
  Header,
  HeadingLevel,
  ImageRun,
  LevelFormat,
  Packer,
  PageNumber,
  Paragraph,
  SectionType,
  ShadingType,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType,
} from "docx";
import ExcelJS from "exceljs";
import PptxGenJS from "pptxgenjs";

const out = join(dirname(fileURLToPath(import.meta.url)), "fixtures");
mkdirSync(out, { recursive: true });

const para = [
  "Plyleaf converts documents inside the browser, so the file never leaves the device. This paragraph fills a line or two with ordinary prose, with commas, numbers like 1,234.56 and a date such as 7 November 2026.",
  "A second paragraph follows with more ordinary sentences. It mentions quarterly figures, a project timeline and a short list of follow-up actions, which is the kind of text most office documents carry.",
  "The third paragraph is longer, so that line breaking and justification get exercised. When a converter measures text differently from Word, the lines wrap at different words, paragraphs grow or shrink, and page breaks drift; that drift is exactly what this spike wants to see.",
];
const rows = [
  ["Region", "Q1", "Q2", "Change"],
  ["North", "12,400", "13,950", "+12.5%"],
  ["South", "9,800", "9,120", "-6.9%"],
  ["East", "15,230", "16,010", "+5.1%"],
  ["West", "7,600", "8,840", "+16.3%"],
  ["Total", "45,030", "47,920", "+6.4%"],
];

// A picture: bars and a circle drawn as a one-page PDF, rendered to PNG with MuPDF.
function picture(): Uint8Array {
  const doc = new mupdf.PDFDocument();
  const bars = [
    ["0.15 0.39 0.92", 120],
    ["0.09 0.64 0.29", 210],
    ["0.96 0.62 0.04", 165],
    ["0.86 0.15 0.15", 255],
    ["0.49 0.23 0.93", 90],
  ] as const;
  let ops = "0.94 0.96 0.99 rg 0 0 600 360 re f\n";
  bars.forEach(([c, h], i) => (ops += `${c} rg ${60 + i * 105} 40 70 ${h} re f\n`));
  ops +=
    "0.15 0.39 0.92 rg 490 270 m 490 309 459 340 420 340 c 381 340 350 309 350 270 c 350 231 381 200 420 200 c 459 200 490 231 490 270 c f\n";
  const page = doc.addPage([0, 0, 600, 360], 0, {}, ops);
  doc.insertPage(-1, page);
  const pix = doc.loadPage(0).toPixmap(mupdf.Matrix.identity, mupdf.ColorSpace.DeviceRGB, false, true);
  return pix.asPNG();
}
const png = picture();
writeFileSync(join(out, "picture.png"), png);

// ---------- Word ----------
const cell = (text: string, header: boolean) =>
  new TableCell({
    width: { size: 25, type: WidthType.PERCENTAGE },
    ...(header ? { shading: { type: ShadingType.CLEAR, fill: "4472C4", color: "auto" } } : {}),
    children: [
      new Paragraph({ children: [new TextRun({ text, bold: header, ...(header ? { color: "FFFFFF" } : {}) })] }),
    ],
  });
const docx = new Document({
  creator: "Plyleaf spike",
  title: "Quarterly Report",
  numbering: {
    config: [
      {
        reference: "numbers",
        levels: [{ level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.START }],
      },
    ],
  },
  footnotes: { 1: { children: [new Paragraph("This footnote checks that notes move to the page foot.")] } },
  sections: [
    {
      headers: { default: new Header({ children: [new Paragraph("Plyleaf conversion test: quarterly report")] }) },
      footers: {
        default: new Footer({
          children: [
            new Paragraph({
              alignment: AlignmentType.CENTER,
              children: [new TextRun({ children: ["Page ", PageNumber.CURRENT, " of ", PageNumber.TOTAL_PAGES] })],
            }),
          ],
        }),
      },
      children: [
        new Paragraph({ text: "Quarterly Report", heading: HeadingLevel.TITLE }),
        new Paragraph({ text: "1. Summary", heading: HeadingLevel.HEADING_1 }),
        ...para.map((t) => new Paragraph(t)),
        new Paragraph({
          children: [
            new TextRun("Formatting: "),
            new TextRun({ text: "bold", bold: true }),
            new TextRun(", "),
            new TextRun({ text: "italic", italics: true }),
            new TextRun(", "),
            new TextRun({ text: "underlined", underline: {} }),
            new TextRun(", "),
            new TextRun({ text: "red text", color: "FF0000" }),
            new TextRun(" and a footnote"),
            new FootnoteReferenceRun(1),
            new TextRun("."),
          ],
        }),
        new Paragraph({ text: "2. Actions", heading: HeadingLevel.HEADING_1 }),
        ...["Review the figures", "Agree the budget for next quarter", "Publish the report"].map(
          (t) => new Paragraph({ text: t, bullet: { level: 0 } }),
        ),
        ...["Collect the data", "Check the totals", "Send for sign-off"].map(
          (t) => new Paragraph({ text: t, numbering: { reference: "numbers", level: 0 } }),
        ),
        new Paragraph({ text: "3. Figures", heading: HeadingLevel.HEADING_1 }),
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          rows: rows.map((r, i) => new TableRow({ children: r.map((t) => cell(t, i === 0)) })),
        }),
        new Paragraph(""),
        new Paragraph({
          children: [new ImageRun({ type: "png", data: png, transformation: { width: 480, height: 288 } })],
        }),
        new Paragraph({ children: [new TextRun({ text: "Figure 1. A picture placed inline.", italics: true })] }),
      ],
    },
    {
      properties: { type: SectionType.NEXT_PAGE, column: { count: 2, space: 708 } },
      children: [
        new Paragraph({ text: "4. Two-column section", heading: HeadingLevel.HEADING_1 }),
        ...Array.from({ length: 6 }, () => para.map((t) => new Paragraph(t))).flat(),
        new Paragraph({ text: "4.1 Justified text", heading: HeadingLevel.HEADING_2 }),
        ...Array.from({ length: 4 }, () => new Paragraph({ text: para[2]!, alignment: AlignmentType.JUSTIFIED })),
        new Paragraph({
          children: [
            new ExternalHyperlink({
              link: "https://example.com/",
              children: [new TextRun({ text: "A hyperlink to example.com", style: "Hyperlink" })],
            }),
          ],
        }),
      ],
    },
  ],
});
writeFileSync(join(out, "report.docx"), await Packer.toBuffer(docx));

// ---------- Excel ----------
const wb = new ExcelJS.Workbook();
const ws = wb.addWorksheet("Budget", {
  pageSetup: { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 1 },
});
ws.mergeCells("A1:F1");
ws.getCell("A1").value = "Budget 2026 (test workbook)";
ws.getCell("A1").font = { size: 16, bold: true };
ws.getCell("A1").alignment = { horizontal: "center" };
ws.getRow(3).values = ["Item", "Category", "Planned", "Actual", "Difference", "Share"];
ws.getRow(3).font = { bold: true };
ws.getRow(3).eachCell((c) => (c.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFC6D7EB" } }));
const cats = ["Staff", "Hosting", "Travel", "Equipment", "Training"];
for (let r = 0; r < 20; r++) {
  const row = r + 4;
  const planned = 1000 + ((r * 733) % 4000);
  const actual = 900 + ((r * 911) % 4300);
  ws.getRow(row).values = [
    `Line item ${r + 1}`,
    cats[r % 5],
    planned,
    actual,
    { formula: `D${row}-C${row}`, result: actual - planned },
    { formula: `D${row}/SUM($D$4:$D$23)` },
  ];
}
ws.getRow(24).values = [
  "Total",
  "",
  { formula: "SUM(C4:C23)" },
  { formula: "SUM(D4:D23)" },
  { formula: "SUM(E4:E23)" },
  { formula: "SUM(F4:F23)" },
];
ws.getRow(24).font = { bold: true };
for (let r = 4; r <= 24; r++) {
  for (const c of ["C", "D", "E"]) ws.getCell(`${c}${r}`).numFmt = '"$"#,##0.00;[Red]-"$"#,##0.00';
  ws.getCell(`F${r}`).numFmt = "0.0%";
  for (const c of "ABCDEF")
    ws.getCell(`${c}${r}`).border = {
      top: { style: "thin" },
      bottom: { style: "thin" },
      left: { style: "thin" },
      right: { style: "thin" },
    };
}
ws.columns = [{ width: 16 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 13 }, { width: 9 }].map((c, i) => ({
  ...c,
  key: String(i),
}));
const img = wb.addImage({ buffer: Buffer.from(png) as unknown as ExcelJS.Buffer, extension: "png" });
ws.addImage(img, { tl: { col: 7, row: 2 }, ext: { width: 360, height: 216 } });
const notes = wb.addWorksheet("Notes");
notes.getColumn(1).width = 60;
para.forEach((t, i) => {
  const c = notes.getCell(`A${i + 1}`);
  c.value = t;
  c.alignment = { wrapText: true, vertical: "top" };
});
await wb.xlsx.writeFile(join(out, "budget.xlsx"));

// ---------- PowerPoint ----------
const pptx = new PptxGenJS();
pptx.layout = "LAYOUT_16x9";
const s1 = pptx.addSlide();
s1.background = { color: "1F3A5F" };
s1.addText("Conversion spike", { x: 0.6, y: 1.8, w: 8.8, h: 1, fontSize: 40, bold: true, color: "FFFFFF" });
s1.addText("A test deck for Plyleaf", { x: 0.6, y: 2.8, w: 8.8, h: 0.6, fontSize: 20, color: "C9D6E8" });
const s2 = pptx.addSlide();
s2.addText("What we check", { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 30, bold: true });
s2.addText(
  ["Text and bullets", "Tables and pictures", "Shapes with fills and outlines", "Charts drawn by the deck"].map(
    (t) => ({
      text: t,
      options: { bullet: true, breakLine: true },
    }),
  ),
  { x: 0.7, y: 1.3, w: 8.5, h: 3, fontSize: 22 },
);
const s3 = pptx.addSlide();
s3.addText("A table", { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 30, bold: true });
s3.addTable(
  rows.map((r, i) =>
    r.map((t) => ({ text: t, options: i === 0 ? { bold: true, color: "FFFFFF", fill: { color: "4472C4" } } : {} })),
  ),
  { x: 0.7, y: 1.3, w: 8.6, fontSize: 16, border: { type: "solid", pt: 1, color: "8EA9DB" } },
);
const s4 = pptx.addSlide();
s4.addText("Shapes and a picture", { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 30, bold: true });
s4.addText("Rounded box", {
  shape: pptx.ShapeType.roundRect,
  x: 0.6,
  y: 1.4,
  w: 2.6,
  h: 1.4,
  fill: { color: "2563EB" },
  color: "FFFFFF",
  align: "center",
  rectRadius: 0.2,
});
s4.addShape(pptx.ShapeType.ellipse, {
  x: 3.6,
  y: 1.4,
  w: 1.6,
  h: 1.6,
  fill: { color: "16A34A" },
  line: { color: "0F5132", width: 2 },
});
s4.addShape(pptx.ShapeType.rightArrow, { x: 5.6, y: 1.8, w: 1.6, h: 0.8, fill: { color: "F59E0B" } });
s4.addImage({ data: "data:image/png;base64," + Buffer.from(png).toString("base64"), x: 0.6, y: 3.1, w: 3.5, h: 2.1 });
const s5 = pptx.addSlide();
s5.addText("A chart", { x: 0.5, y: 0.3, w: 9, h: 0.8, fontSize: 30, bold: true });
s5.addChart(
  pptx.ChartType.bar,
  [
    { name: "Q1", labels: ["North", "South", "East", "West"], values: [12400, 9800, 15230, 7600] },
    { name: "Q2", labels: ["North", "South", "East", "West"], values: [13950, 9120, 16010, 8840] },
  ],
  { x: 0.7, y: 1.2, w: 8.6, h: 4, showLegend: true, legendPos: "b", showTitle: true, title: "Revenue by region" },
);
writeFileSync(join(out, "deck.pptx"), (await pptx.write({ outputType: "nodebuffer" })) as Buffer);

// ---------- HTML ----------
writeFileSync(
  join(out, "page.html"),
  `<!doctype html><html><head><meta charset="utf-8"><title>HTML test</title>
<style>body{font-family:sans-serif;margin:2cm}table{border-collapse:collapse}td,th{border:1px solid #888;padding:4px 8px}th{background:#4472c4;color:#fff}</style>
</head><body><h1>HTML test page</h1>${para.map((t) => `<p>${t}</p>`).join("")}
<table>${rows.map((r, i) => `<tr>${r.map((t) => (i === 0 ? `<th>${t}</th>` : `<td>${t}</td>`)).join("")}</tr>`).join("")}</table>
<p><img src="data:image/png;base64,${Buffer.from(png).toString("base64")}" width="480"></p></body></html>`,
);

console.log("fixtures written to", out);
