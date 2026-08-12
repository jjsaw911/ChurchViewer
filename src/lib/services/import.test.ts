/**
 * Reading slides out of the files a church already has.
 *
 * The fixtures are built here rather than checked in as binaries, so what is
 * being claimed about the format is written down in the test: a zip with these
 * entries, holding this XML, should come out as these words in this order.
 */
import assert from "node:assert/strict";
import test from "node:test";
import { deflateRawSync } from "node:zlib";

import { slidesFromDocx, slidesFromFile, slidesFromPptx, isImportable } from "@/lib/services/import";

/** A zip of the given entries, deflated, with a central directory. */
function zip(entries: { name: string; text: string }[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;

  for (const entry of entries) {
    const name = Buffer.from(entry.name, "utf8");
    const raw = Buffer.from(entry.text, "utf8");
    const data = deflateRawSync(raw);

    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(8, 8); // deflate
    local.writeUInt32LE(data.length, 18);
    local.writeUInt32LE(raw.length, 22);
    local.writeUInt16LE(name.length, 26);
    locals.push(local, name, data);

    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(8, 10);
    central.writeUInt32LE(data.length, 20);
    central.writeUInt32LE(raw.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, name);

    offset += local.length + name.length + data.length;
  }

  const body = Buffer.concat(locals);
  const directory = Buffer.concat(centrals);

  const end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0);
  end.writeUInt16LE(entries.length, 8);
  end.writeUInt16LE(entries.length, 10);
  end.writeUInt32LE(directory.length, 12);
  end.writeUInt32LE(body.length, 16);

  return Buffer.concat([body, directory, end]);
}

const slide = (paragraphs: string[]) =>
  `<p:sld><p:cSld><p:spTree>${paragraphs
    .map((line) => `<a:p><a:r><a:t>${line}</a:t></a:r></a:p>`)
    .join("")}</p:spTree></p:cSld></p:sld>`;

test("a PowerPoint becomes one slide per slide", () => {
  const file = zip([
    { name: "ppt/slides/slide1.xml", text: slide(["Welcome", "Good morning"]) },
    { name: "ppt/slides/slide2.xml", text: slide(["Men's breakfast", "Saturday, 8am"]) },
  ]);

  const slides = slidesFromPptx(file);
  assert.equal(slides.length, 2);
  assert.deepEqual(slides[0].lines, ["Welcome", "Good morning"]);
  assert.deepEqual(slides[1].lines, ["Men's breakfast", "Saturday, 8am"]);
});

test("slide ten comes after slide two, not after slide one", () => {
  const file = zip([
    { name: "ppt/slides/slide10.xml", text: slide(["Tenth"]) },
    { name: "ppt/slides/slide2.xml", text: slide(["Second"]) },
    { name: "ppt/slides/slide1.xml", text: slide(["First"]) },
  ]);

  assert.deepEqual(
    slidesFromPptx(file).map((one) => one.lines[0]),
    ["First", "Second", "Tenth"],
  );
});

test("a slide with no words on it is left out", () => {
  const file = zip([
    { name: "ppt/slides/slide1.xml", text: slide(["Welcome"]) },
    // A picture-only slide, which is every deck's title card.
    { name: "ppt/slides/slide2.xml", text: "<p:sld><p:cSld><p:spTree/></p:cSld></p:sld>" },
    { name: "ppt/slides/slide3.xml", text: slide(["Baptism class"]) },
  ]);

  assert.deepEqual(
    slidesFromPptx(file).map((one) => one.lines[0]),
    ["Welcome", "Baptism class"],
  );
});

test("text split across runs is put back together, and entities decoded", () => {
  // Word and PowerPoint split a line into runs wherever formatting changes, so
  // "Tom & Jerry" arrives as three pieces with an entity in the middle.
  const file = zip([
    {
      name: "ppt/slides/slide1.xml",
      text: "<p:sld><a:p><a:r><a:t>Tom </a:t></a:r><a:r><a:t>&amp;</a:t></a:r><a:r><a:t> Jerry</a:t></a:r></a:p></p:sld>",
    },
  ]);

  assert.deepEqual(slidesFromPptx(file)[0].lines, ["Tom & Jerry"]);
});

test("notes and other parts of the deck are ignored", () => {
  const file = zip([
    { name: "ppt/slides/slide1.xml", text: slide(["On the screen"]) },
    { name: "ppt/notesSlides/notesSlide1.xml", text: slide(["Don't read this out"]) },
    { name: "docProps/app.xml", text: "<Properties><Titles>Deck</Titles></Properties>" },
  ]);

  const slides = slidesFromPptx(file);
  assert.equal(slides.length, 1);
  assert.deepEqual(slides[0].lines, ["On the screen"]);
});

test("a Word document breaks into slides at its blank lines", () => {
  const paragraph = (text: string) =>
    text ? `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>` : "<w:p/>";

  const file = zip([
    {
      name: "word/document.xml",
      text: `<w:document><w:body>${[
        paragraph("Men's breakfast"),
        paragraph("Saturday, 8am"),
        paragraph(""),
        paragraph("Baptism class"),
        paragraph("Starts the 21st"),
      ].join("")}</w:body></w:document>`,
    },
  ]);

  const slides = slidesFromDocx(file);
  assert.equal(slides.length, 2);
  assert.deepEqual(slides[0].lines, ["Men's breakfast", "Saturday, 8am"]);
  assert.deepEqual(slides[1].lines, ["Baptism class", "Starts the 21st"]);
});

test("plain text uses the same rule as the paste box", () => {
  const slides = slidesFromFile(
    "notices.txt",
    Buffer.from("Welcome\nGood morning\n\nOffering\n", "utf8"),
  );

  assert.deepEqual(
    slides.map((one) => one.lines),
    [["Welcome", "Good morning"], ["Offering"]],
  );
});

test("only the formats that can actually be read are offered", () => {
  assert.ok(isImportable("Announcements.PPTX"));
  assert.ok(isImportable("notices.docx"));
  assert.ok(isImportable("readings.txt"));
  // A PDF is a page description, not a document with paragraphs in it, and
  // pretending otherwise would import gibberish.
  assert.equal(isImportable("bulletin.pdf"), false);
  assert.equal(isImportable("slides.key"), false);
});
