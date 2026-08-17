import { inflateRawSync } from "node:zlib";

/**
 * Reading a zip, because a PowerPoint is one.
 *
 * `.pptx` and `.docx` are zipped folders of XML — which is lucky, because it
 * means importing the announcements somebody built in PowerPoint needs no
 * library at all: find the entry, inflate it, read the text out. A dependency
 * for this would be a dependency to keep patched for years, on a server that
 * exists so one church can put words on a wall.
 *
 * Only what these files actually use: stored and deflated entries, read from
 * the central directory so a stream with junk in front of it still works.
 */
export type ZipEntry = { name: string; data: Buffer };

const SIGNATURE = {
  endOfCentralDirectory: 0x06054b50,
  centralFile: 0x02014b50,
} as const;

export function readZip(archive: Buffer): ZipEntry[] {
  const end = findEndOfCentralDirectory(archive);
  if (end < 0) throw new Error("That doesn't look like a zip file.");

  const count = archive.readUInt16LE(end + 10);
  let offset = archive.readUInt32LE(end + 16);

  const entries: ZipEntry[] = [];

  for (let index = 0; index < count; index += 1) {
    if (offset + 46 > archive.length) break;
    if (archive.readUInt32LE(offset) !== SIGNATURE.centralFile) break;

    const method = archive.readUInt16LE(offset + 10);
    const compressedSize = archive.readUInt32LE(offset + 20);
    const nameLength = archive.readUInt16LE(offset + 28);
    const extraLength = archive.readUInt16LE(offset + 30);
    const commentLength = archive.readUInt16LE(offset + 32);
    const localOffset = archive.readUInt32LE(offset + 42);
    const name = archive.subarray(offset + 46, offset + 46 + nameLength).toString("utf8");

    // The local header repeats the name and extra field, and its lengths are
    // the ones that count — some writers put different extra fields in each.
    const localNameLength = archive.readUInt16LE(localOffset + 26);
    const localExtraLength = archive.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localNameLength + localExtraLength;
    const raw = archive.subarray(start, start + compressedSize);

    if (method === 0) entries.push({ name, data: Buffer.from(raw) });
    else if (method === 8) entries.push({ name, data: inflateRawSync(raw) });
    // Anything else is a compression nobody's Office has written this century.

    offset += 46 + nameLength + extraLength + commentLength;
  }

  return entries;
}

/**
 * The end-of-central-directory record, searched for backwards.
 *
 * It sits at the very end unless the file has a comment, so backwards finds it
 * immediately in every real case and still finds it when it doesn't.
 */
function findEndOfCentralDirectory(archive: Buffer): number {
  const earliest = Math.max(0, archive.length - 22 - 0xffff);
  for (let at = archive.length - 22; at >= earliest; at -= 1) {
    if (archive.readUInt32LE(at) === SIGNATURE.endOfCentralDirectory) return at;
  }
  return -1;
}
