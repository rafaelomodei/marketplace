import fs from "node:fs";
import zlib from "node:zlib";

/**
 * Reading single entries of a zip (3MF is a zip) without loading the whole file: the central directory says where
 * each entry is, so only the bytes of the entries asked for are read from disk and inflated. A 180 MB 3MF whose
 * meshes inflate to 1 GB costs a few KB to list and ~40 KB to get a plate picture.
 */

export type ZipEntry = { name: string; method: number; compressedSize: number; size: number; offset: number };

/** Random access to the bytes of a zip: a file on disk (read piece by piece) or a buffer already in memory. */
type Source = { size: number; read(pos: number, len: number): Buffer; close(): void };

function bufferSource(data: Uint8Array): Source {
  const buf = Buffer.from(data.buffer, data.byteOffset, data.byteLength);
  return { size: buf.length, read: (pos, len) => buf.subarray(pos, pos + len), close: () => {} };
}

function fileSource(file: string): Source {
  const fd = fs.openSync(file, "r");
  return {
    size: fs.fstatSync(fd).size,
    read(pos, len) {
      const b = Buffer.alloc(len);
      return b.subarray(0, fs.readSync(fd, b, 0, len, pos));
    },
    close: () => fs.closeSync(fd),
  };
}

const EOCD = 0x06054b50;
const EOCD64 = 0x06064b50;
const LOCATOR64 = 0x07064b50;
const CENTRAL = 0x02014b50;
const LOCAL = 0x04034b50;

function readDirectory(src: Source): Map<string, ZipEntry> {
  const tailLen = Math.min(src.size, 22 + 0xffff);
  const tail = src.read(src.size - tailLen, tailLen);
  let at = -1;
  for (let i = tail.length - 22; i >= 0; i--) if (tail.readUInt32LE(i) === EOCD) { at = i; break; }
  if (at < 0) throw new Error("Arquivo zip inválido");
  let count = tail.readUInt16LE(at + 10);
  let cdSize = tail.readUInt32LE(at + 12);
  let cdOffset = tail.readUInt32LE(at + 16);
  if (count === 0xffff || cdSize === 0xffffffff || cdOffset === 0xffffffff) {
    const loc = at - 20 >= 0 && tail.readUInt32LE(at - 20) === LOCATOR64 ? Number(tail.readBigUInt64LE(at - 20 + 8)) : -1;
    const z64 = loc >= 0 ? src.read(loc, 56) : null;
    if (z64 && z64.readUInt32LE(0) === EOCD64) {
      count = Number(z64.readBigUInt64LE(32));
      cdSize = Number(z64.readBigUInt64LE(40));
      cdOffset = Number(z64.readBigUInt64LE(48));
    }
  }
  const cd = src.read(cdOffset, cdSize);
  const entries = new Map<string, ZipEntry>();
  for (let p = 0, n = 0; n < count && p + 46 <= cd.length && cd.readUInt32LE(p) === CENTRAL; n++) {
    const nameLen = cd.readUInt16LE(p + 28);
    const extraLen = cd.readUInt16LE(p + 30);
    const commentLen = cd.readUInt16LE(p + 32);
    const e: ZipEntry = {
      name: cd.toString("utf8", p + 46, p + 46 + nameLen),
      method: cd.readUInt16LE(p + 10),
      compressedSize: cd.readUInt32LE(p + 20),
      size: cd.readUInt32LE(p + 24),
      offset: cd.readUInt32LE(p + 42),
    };
    // ZIP64: the real sizes/offset are in the extra field, in this order, only for the fields set to 0xFFFFFFFF.
    for (let x = p + 46 + nameLen; x + 4 <= p + 46 + nameLen + extraLen; ) {
      const id = cd.readUInt16LE(x);
      const len = cd.readUInt16LE(x + 2);
      if (id === 0x0001) {
        let q = x + 4;
        const next = () => (q += 8, Number(cd.readBigUInt64LE(q - 8)));
        if (e.size === 0xffffffff) e.size = next();
        if (e.compressedSize === 0xffffffff) e.compressedSize = next();
        if (e.offset === 0xffffffff) e.offset = next();
      }
      x += 4 + len;
    }
    entries.set(e.name, e);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return entries;
}

export class Zip {
  readonly entries: Map<string, ZipEntry>;
  private src: Source;

  /** A path is read piece by piece from disk; bytes already in memory are read in place. */
  constructor(input: string | Uint8Array) {
    this.src = typeof input === "string" ? fileSource(input) : bufferSource(input);
    try {
      this.entries = readDirectory(this.src);
    } catch (e) {
      this.src.close();
      throw e;
    }
  }

  names(): string[] {
    return [...this.entries.keys()];
  }

  /** The inflated bytes of one entry (null when it is not in the zip). */
  read(name: string): Buffer | null {
    const e = this.entries.get(name);
    if (!e) return null;
    const head = this.src.read(e.offset, 30);
    if (head.length < 30 || head.readUInt32LE(0) !== LOCAL) throw new Error(`Entrada inválida no zip: ${name}`);
    const raw = this.src.read(e.offset + 30 + head.readUInt16LE(26) + head.readUInt16LE(28), e.compressedSize);
    if (e.method === 0) return Buffer.from(raw);
    if (e.method === 8) return zlib.inflateRawSync(raw);
    throw new Error(`Compressão não suportada no zip: ${name}`);
  }

  text(name: string): string | null {
    return this.read(name)?.toString("utf8") ?? null;
  }

  close() {
    this.src.close();
  }
}

/** Opens a zip, runs `fn` and closes it. */
export function withZip<T>(input: string | Uint8Array, fn: (zip: Zip) => T): T {
  const zip = new Zip(input);
  try {
    return fn(zip);
  } finally {
    zip.close();
  }
}
