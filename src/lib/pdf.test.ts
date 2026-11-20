import { describe, expect, it } from "vitest";
import { PdfDoc } from "./pdf";

const read = (b: Blob) =>
  new Promise<string>((ok) => {
    const r = new FileReader();
    r.onload = () => ok(String(r.result));
    r.readAsBinaryString(b);
  });

describe("PDF writer", () => {
  it("embeds a JPEG logo as an image XObject and draws it on the page", async () => {
    const pdf = new PdfDoc();
    const jpeg = {
      data: "\xff\xd8\xff\xe0JFIF\xff\xd9",
      width: 300,
      height: 100,
    };
    pdf.image(40, 40, 150, 50, jpeg);
    pdf.text(40, 120, "DELIVERY NOTE", 18, true);
    const text = await read(pdf.toBlob());
    expect(text).toContain("/Subtype /Image /Width 300 /Height 100");
    expect(text).toContain("/Filter /DCTDecode /Length 10");
    expect(text).toContain("/XObject << /Im1 5 0 R >>");
    expect(text).toContain("150.00 0 0 50.00 40.00 751.89 cm /Im1 Do");
    expect(text).toContain("\xff\xd8\xff\xe0JFIF"); // binary JPEG bytes kept as-is
  });
});
