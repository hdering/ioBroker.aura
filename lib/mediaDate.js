'use strict';

/**
 * Capture date of a photo or video, read from the file itself (#848).
 *
 * The slideshow sorts by "date", and the file date is the wrong one more often
 * than not: photos copied from a phone or restored from a backup all share the
 * day they were copied. The camera writes the real moment into the file:
 *
 *   - JPEG: EXIF in the APP1 segment right after the start marker
 *   - WebP: an `EXIF` chunk in the RIFF container (often behind the image data)
 *   - PNG:  an `eXIf` chunk
 *   - MP4 / MOV: `creation_time` of the `mvhd` box inside `moov` (front or end)
 *
 * No dependency: the TIFF structure EXIF uses is small enough to walk by hand,
 * and the containers are walked with positioned reads so a 200 MB video is not
 * read into memory to find a 100-byte box. Anything unreadable yields `null` and
 * the caller falls back to the file date.
 */

const fs = require('node:fs');

/** JPEG keeps EXIF in the first segments; real files stay far below this. */
const JPEG_HEAD_BYTES = 128 * 1024;
/** Upper bound for one EXIF block (spec limit of an APP1 segment is 64 KB). */
const MAX_EXIF_BYTES = 256 * 1024;
/** Container walks stop after this many hops - a PNG with tiny IDAT chunks, a corrupt size. */
const MAX_HOPS = 4000;
/** Seconds between 1904-01-01 (QuickTime epoch) and 1970-01-01. */
const QT_EPOCH_OFFSET = 2082844800;
/** Dates before this are a camera without a set clock (1970, 2000-01-01 …) rather than a capture. */
const MIN_PLAUSIBLE = Date.UTC(1990, 0, 1);

const TAG_DATETIME = 0x0132;
const TAG_EXIF_IFD = 0x8769;
const TAG_DATETIME_ORIGINAL = 0x9003;
const TAG_DATETIME_DIGITIZED = 0x9004;
const TAG_OFFSET_TIME = 0x9010;
const TAG_OFFSET_TIME_ORIGINAL = 0x9011;
const TAG_OFFSET_TIME_DIGITIZED = 0x9012;

/**
 * `2024:07:14 18:03:22` (+ optional `+02:00`) → epoch ms. Without an offset the
 * time is taken as local time of the server - EXIF itself has no zone, and the
 * server usually stands where the photos were taken.
 *
 * @param {string|null} s EXIF date string
 * @param {string|null} [offset] EXIF OffsetTime* value (`+02:00`)
 * @returns {number|null} epoch ms or null
 */
function parseExifDate(s, offset) {
    if (!s) {
        return null;
    }
    const m = /^(\d{4})[:-](\d{2})[:-](\d{2})[ T](\d{2}):(\d{2}):(\d{2})/.exec(s.trim());
    if (!m) {
        return null;
    }
    const [y, mo, d, h, mi, se] = m.slice(1).map(Number);
    if (y < 1900 || mo < 1 || mo > 12 || d < 1 || d > 31 || h > 23 || mi > 59 || se > 60) {
        return null;
    }
    const off = offset ? /^([+-])(\d{2}):?(\d{2})$/.exec(offset.trim()) : null;
    let ts;
    if (off) {
        const sign = off[1] === '-' ? -1 : 1;
        ts = Date.UTC(y, mo - 1, d, h, mi, se) - sign * (Number(off[2]) * 60 + Number(off[3])) * 60000;
    } else {
        ts = new Date(y, mo - 1, d, h, mi, se).getTime();
    }
    return plausible(ts);
}

/**
 * @param {number} ts epoch ms
 * @returns {number|null} ts, or null for a clock that was never set or lies in the future
 */
function plausible(ts) {
    if (!Number.isFinite(ts)) {
        return null;
    }
    if (ts < MIN_PLAUSIBLE) {
        return null;
    }
    if (ts > Date.now() + 2 * 86400000) {
        return null;
    }
    return ts;
}

/**
 * Walk a TIFF structure (the body of every EXIF block) for the capture date.
 *
 * @param {Buffer} buf buffer holding the TIFF data
 * @param {number} [start] offset of the TIFF header (`II*\0` / `MM\0*`) in buf
 * @returns {number|null} epoch ms or null
 */
function parseTiffDate(buf, start = 0) {
    if (start + 8 > buf.length) {
        return null;
    }
    const order = buf.toString('latin1', start, start + 2);
    let le;
    if (order === 'II') {
        le = true;
    } else if (order === 'MM') {
        le = false;
    } else {
        return null;
    }
    const u16 = (o) => (le ? buf.readUInt16LE(o) : buf.readUInt16BE(o));
    const u32 = (o) => (le ? buf.readUInt32LE(o) : buf.readUInt32BE(o));
    if (u16(start + 2) !== 42) {
        return null;
    }

    const tags = new Map();
    const readIfd = (rel) => {
        const at = start + rel;
        if (rel < 8 || at + 2 > buf.length) {
            return;
        }
        const count = u16(at);
        if (count > 512) {
            return;
        }
        for (let i = 0; i < count; i++) {
            const e = at + 2 + i * 12;
            if (e + 12 > buf.length) {
                return;
            }
            const tag = u16(e);
            const type = u16(e + 2);
            const n = u32(e + 4);
            if (type === 2) {
                // ASCII: inline when it fits in 4 bytes, otherwise at an offset.
                const dataAt = n <= 4 ? e + 8 : start + u32(e + 8);
                if (dataAt + n > buf.length) {
                    continue;
                }
                tags.set(tag, buf.toString('latin1', dataAt, dataAt + n).replace(/\0+$/, ''));
            } else if (type === 4 || type === 13) {
                tags.set(tag, u32(e + 8));
            }
        }
    };
    readIfd(u32(start + 4));
    const exifIfd = tags.get(TAG_EXIF_IFD);
    if (typeof exifIfd === 'number') {
        readIfd(exifIfd);
    }

    const str = (t) => {
        const v = tags.get(t);
        return typeof v === 'string' ? v : null;
    };
    return (
        parseExifDate(str(TAG_DATETIME_ORIGINAL), str(TAG_OFFSET_TIME_ORIGINAL) || str(TAG_OFFSET_TIME)) ??
        parseExifDate(str(TAG_DATETIME_DIGITIZED), str(TAG_OFFSET_TIME_DIGITIZED) || str(TAG_OFFSET_TIME)) ??
        parseExifDate(str(TAG_DATETIME), str(TAG_OFFSET_TIME))
    );
}

/**
 * An EXIF payload as found in a container: with or without the `Exif\0\0` prefix.
 *
 * @param {Buffer} buf EXIF payload
 * @returns {number|null} epoch ms or null
 */
function parseExifPayload(buf) {
    if (buf.length >= 6 && buf.toString('latin1', 0, 4) === 'Exif') {
        return parseTiffDate(buf, 6);
    }
    return parseTiffDate(buf, 0);
}

/**
 * JPEG: walk the segments up to the image data and read the APP1 `Exif` one.
 *
 * @param {Buffer} buf the first bytes of the file
 * @returns {number|null} epoch ms or null
 */
function parseJpegDate(buf) {
    if (buf.length < 4 || buf[0] !== 0xff || buf[1] !== 0xd8) {
        return null;
    }
    let p = 2;
    while (p + 4 <= buf.length) {
        if (buf[p] !== 0xff) {
            return null;
        }
        const marker = buf[p + 1];
        if (marker === 0xff) {
            p++; // fill byte
            continue;
        }
        if (marker === 0xda || marker === 0xd9) {
            return null;
        } // image data / end: no EXIF before it
        const len = buf.readUInt16BE(p + 2);
        if (len < 2) {
            return null;
        }
        if (marker === 0xe1 && p + 10 <= buf.length && buf.toString('latin1', p + 4, p + 10) === 'Exif\0\0') {
            return parseTiffDate(buf.subarray(0, Math.min(buf.length, p + 2 + len)), p + 10);
        }
        p += 2 + len;
    }
    return null;
}

/**
 * Positioned reads on an open file.
 *
 * @param {import('node:fs/promises').FileHandle} fh open file
 * @param {number} pos byte offset
 * @param {number} len bytes wanted
 * @returns {Promise<Buffer>} what could be read (shorter at the end of the file)
 */
async function readAt(fh, pos, len) {
    const buf = Buffer.alloc(len);
    const { bytesRead } = await fh.read(buf, 0, len, pos);
    return bytesRead < len ? buf.subarray(0, bytesRead) : buf;
}

/**
 * WebP (RIFF): chunks of fourcc + LE size, padded to even length.
 *
 * @param {import('node:fs/promises').FileHandle} fh open file
 * @param {number} size file size
 * @returns {Promise<number|null>} epoch ms or null
 */
async function webpDate(fh, size) {
    let p = 12;
    for (let hop = 0; hop < MAX_HOPS && p + 8 <= size; hop++) {
        const h = await readAt(fh, p, 8);
        if (h.length < 8) {
            return null;
        }
        const type = h.toString('latin1', 0, 4);
        const len = h.readUInt32LE(4);
        if (type === 'EXIF') {
            if (len > MAX_EXIF_BYTES) {
                return null;
            }
            return parseExifPayload(await readAt(fh, p + 8, len));
        }
        p += 8 + len + (len & 1);
    }
    return null;
}

/**
 * PNG: chunks of BE length + type + data + CRC.
 *
 * @param {import('node:fs/promises').FileHandle} fh open file
 * @param {number} size file size
 * @returns {Promise<number|null>} epoch ms or null
 */
async function pngDate(fh, size) {
    let p = 8;
    for (let hop = 0; hop < MAX_HOPS && p + 8 <= size; hop++) {
        const h = await readAt(fh, p, 8);
        if (h.length < 8) {
            return null;
        }
        const len = h.readUInt32BE(0);
        const type = h.toString('latin1', 4, 8);
        if (type === 'eXIf') {
            if (len > MAX_EXIF_BYTES) {
                return null;
            }
            return parseExifPayload(await readAt(fh, p + 8, len));
        }
        if (type === 'IEND') {
            return null;
        }
        p += 12 + len;
    }
    return null;
}

/**
 * ISO BMFF (MP4/MOV): find `moov` at top level, then `mvhd` inside it.
 *
 * @param {import('node:fs/promises').FileHandle} fh open file
 * @param {number} size file size
 * @returns {Promise<number|null>} epoch ms or null
 */
async function mp4Date(fh, size) {
    /**
     * @param {number} from first box
     * @param {number} to end of the parent
     * @param {string} want box type to find
     * @returns {Promise<{body: number, end: number}|null>} the box's payload range
     */
    const find = async (from, to, want) => {
        let p = from;
        for (let hop = 0; hop < MAX_HOPS && p + 8 <= to; hop++) {
            const h = await readAt(fh, p, 16);
            if (h.length < 8) {
                return null;
            }
            let len = h.readUInt32BE(0);
            const type = h.toString('latin1', 4, 8);
            let head = 8;
            if (len === 1) {
                if (h.length < 16) {
                    return null;
                }
                len = Number(h.readBigUInt64BE(8));
                head = 16;
            } else if (len === 0) {
                len = to - p;
            }
            if (len < head) {
                return null;
            }
            if (type === want) {
                return { body: p + head, end: Math.min(to, p + len) };
            }
            p += len;
        }
        return null;
    };
    const moov = await find(0, size, 'moov');
    if (!moov) {
        return null;
    }
    const mvhd = await find(moov.body, moov.end, 'mvhd');
    if (!mvhd) {
        return null;
    }
    const b = await readAt(fh, mvhd.body, 12);
    if (b.length < 8) {
        return null;
    }
    const secs = b[0] === 1 ? (b.length >= 12 ? Number(b.readBigUInt64BE(4)) : 0) : b.readUInt32BE(4);
    if (!secs) {
        return null;
    }
    return plausible((secs - QT_EPOCH_OFFSET) * 1000);
}

/**
 * Capture date of a media file, or null when the file carries none.
 *
 * @param {string} absPath file to read
 * @returns {Promise<number|null>} epoch ms or null
 */
async function readMediaDate(absPath) {
    let fh;
    try {
        fh = await fs.promises.open(absPath, 'r');
        const { size } = await fh.stat();
        const head = await readAt(fh, 0, Math.min(size, JPEG_HEAD_BYTES));
        if (head.length >= 2 && head[0] === 0xff && head[1] === 0xd8) {
            return parseJpegDate(head);
        }
        if (
            head.length >= 12 &&
            head.toString('latin1', 0, 4) === 'RIFF' &&
            head.toString('latin1', 8, 12) === 'WEBP'
        ) {
            return await webpDate(fh, size);
        }
        if (head.length >= 8 && head.readUInt32BE(0) === 0x89504e47 && head.readUInt32BE(4) === 0x0d0a1a0a) {
            return await pngDate(fh, size);
        }
        if (head.length >= 8 && /^(ftyp|moov|mdat|wide|free|skip)$/.test(head.toString('latin1', 4, 8))) {
            return await mp4Date(fh, size);
        }
        return null;
    } catch {
        return null;
    } finally {
        await fh?.close().catch(() => {});
    }
}

module.exports = { readMediaDate, parseExifDate, parseTiffDate, parseJpegDate, parseExifPayload };
