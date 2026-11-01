# Editor sample

`editor-sample.pdf` has one of everything the editor and page tools write (M5). It's made by
`tests/unit/viewers.test.ts`, which also writes a fresh copy to `test-results/editor-sample.pdf` on every run.

Tests check it in PDFium (Chrome and Edge's viewer: drawn the same as MuPDF draws it) and pdf.js (Firefox's: the text
and annotations are found). Acrobat Reader and macOS Preview can only be checked by hand. Open the file in each and
check that:

**Page 1**
- [ ] "Page 1 of 2" at the top right; "Added in Helvetica" in black; "Times bold, two lines, Ünïcödé Жук" in blue bold
  serif on two lines; "Courier italic" in green.
- [ ] A small picture (red top-left quarter) under the text, and a green APPROVED stamp below it.
- [ ] A yellow rectangle with a red outline, a blue ellipse and a black arrow pointing up and right.
- [ ] A white box hiding nothing in particular (left side, below the shapes) and a faint red "DRAFT" turned upwards.
- [ ] A blue freehand "V" bottom left.
- [ ] "Page 1" at the bottom highlighted yellow and underlined blue; both listed as comments.
- [ ] A note icon on the right that opens to "A comment".

**Page 2** (shown landscape)
- [ ] "On a turned page" at the top left and "Page 2 of 2" at the top right, both upright.
- [ ] A red PAID stamp, upright.
- [ ] A note that opens to "Turned page note", and "Page 2" (running up the left edge) struck out in red.
