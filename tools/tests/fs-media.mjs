// Backend of the slideshow widget (#848): capture dates from EXIF / mp4,
// folder scan for /fs/media, the date cache and byte ranges for /fs/read.
//
//   node tools/tests/fs-media.mjs
//
// The media files are built byte by byte here, so the test needs no fixtures
// and shows exactly which structure each parser has to understand.
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync, readFileSync, existsSync, symlinkSync } from 'node:fs';
import { tmpdir } from 'node:os';

const require = createRequire(import.meta.url);
const { readMediaDate, parseExifDate } = require(join(process.cwd(), 'lib/mediaDate.js'));
const { scanFolder, parseRange, createMediaLibrary, mediaKind } = require(join(process.cwd(), 'lib/mediaLibrary.js'));

const results = [];
const check = (name, ok, detail = '') => {
    results.push({ name, ok, detail });
    console.log(`${ok ? '  ok  ' : '  FAIL'} ${name}${detail && !ok ? ` - ${detail}` : ''}`);
};
const eq = (name, got, want) =>
    check(
        name,
        JSON.stringify(got) === JSON.stringify(want),
        `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`,
    );

// ── builders ─────────────────────────────────────────────────────────────────

/**
 * TIFF block: IFD0 with DateTime + pointer to an Exif IFD with DateTimeOriginal (+ offset).
 *
 * @param root0
 * @param root0.le
 * @param root0.original
 * @param root0.modified
 * @param root0.offset
 */
function tiff({ le = true, original, modified, offset } = {}) {
    const ascii = (s) => Buffer.from(`${s}\0`, 'latin1');
    const u16 = (v) => {
        const b = Buffer.alloc(2);
        le ? b.writeUInt16LE(v) : b.writeUInt16BE(v);
        return b;
    };
    const u32 = (v) => {
        const b = Buffer.alloc(4);
        le ? b.writeUInt32LE(v) : b.writeUInt32BE(v);
        return b;
    };
    const ifd0Tags = [];
    const exifTags = [];
    if (modified) {
        ifd0Tags.push({ tag: 0x0132, data: ascii(modified) });
    }
    if (original) {
        exifTags.push({ tag: 0x9003, data: ascii(original) });
    }
    if (offset) {
        exifTags.push({ tag: 0x9011, data: ascii(offset) });
    }
    // layout: header(8) | IFD0 | Exif IFD | data
    const ifd0Count = ifd0Tags.length + (exifTags.length ? 1 : 0);
    const ifd0Size = 2 + ifd0Count * 12 + 4;
    const exifSize = exifTags.length ? 2 + exifTags.length * 12 + 4 : 0;
    let dataAt = 8 + ifd0Size + exifSize;
    const data = [];
    const entry = (t) => {
        const n = t.data.length;
        let value;
        if (n <= 4) {
            value = Buffer.alloc(4);
            t.data.copy(value);
        } else {
            value = u32(dataAt);
            data.push(t.data);
            dataAt += n;
        }
        return Buffer.concat([u16(t.tag), u16(2), u32(n), value]);
    };
    const parts = [Buffer.from(le ? 'II' : 'MM', 'latin1'), u16(42), u32(8), u16(ifd0Count)];
    for (const t of ifd0Tags) {
        parts.push(entry(t));
    }
    if (exifTags.length) {
        parts.push(Buffer.concat([u16(0x8769), u16(4), u32(1), u32(8 + ifd0Size)]));
    }
    parts.push(u32(0));
    if (exifTags.length) {
        parts.push(u16(exifTags.length));
        for (const t of exifTags) {
            parts.push(entry(t));
        }
        parts.push(u32(0));
    }
    return Buffer.concat([...parts, ...data]);
}

function jpeg(exif) {
    const segs = [Buffer.from([0xff, 0xd8])];
    // an APP0 JFIF segment first, as real cameras write it
    const jfif = Buffer.from('JFIF\0\x01\x01\0\0\x01\0\x01\0\0', 'latin1');
    segs.push(Buffer.from([0xff, 0xe0, 0, jfif.length + 2]), jfif);
    if (exif) {
        const body = Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), exif]);
        const len = Buffer.alloc(2);
        len.writeUInt16BE(body.length + 2);
        segs.push(Buffer.from([0xff, 0xe1]), len, body);
    }
    segs.push(Buffer.from([0xff, 0xda, 0, 2]), Buffer.alloc(64, 0x11), Buffer.from([0xff, 0xd9]));
    return Buffer.concat(segs);
}

function png(exif) {
    const chunk = (type, data) => {
        const len = Buffer.alloc(4);
        len.writeUInt32BE(data.length);
        return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
    };
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', Buffer.alloc(13)),
        chunk('IDAT', Buffer.alloc(300, 7)),
        chunk('eXIf', exif),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

function webp(exif) {
    const chunk = (type, data) => {
        const len = Buffer.alloc(4);
        len.writeUInt32LE(data.length);
        return Buffer.concat([
            Buffer.from(type, 'latin1'),
            len,
            data,
            data.length & 1 ? Buffer.alloc(1) : Buffer.alloc(0),
        ]);
    };
    const body = Buffer.concat([
        Buffer.from('WEBP', 'latin1'),
        chunk('VP8X', Buffer.alloc(10)),
        chunk('VP8 ', Buffer.alloc(501, 3)), // odd length → padding byte
        chunk('EXIF', exif),
    ]);
    const len = Buffer.alloc(4);
    len.writeUInt32LE(body.length);
    return Buffer.concat([Buffer.from('RIFF', 'latin1'), len, body]);
}

function box(type, ...payload) {
    const data = Buffer.concat(payload);
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length + 8);
    return Buffer.concat([len, Buffer.from(type, 'latin1'), data]);
}
function mp4({ epochSec, version = 0, moovAtEnd = false }) {
    const qt = epochSec + 2082844800;
    let mvhd;
    if (version === 1) {
        const b = Buffer.alloc(4 + 8 + 8 + 4 + 8);
        b[0] = 1;
        b.writeBigUInt64BE(BigInt(qt), 4);
        mvhd = b;
    } else {
        const b = Buffer.alloc(4 + 4 + 4 + 4 + 4);
        b.writeUInt32BE(qt, 4);
        mvhd = b;
    }
    const moov = box('moov', box('mvhd', mvhd), box('trak', Buffer.alloc(40)));
    const ftyp = box('ftyp', Buffer.from('isom\0\0\0\0isomiso2', 'latin1'));
    const mdat = box('mdat', Buffer.alloc(2000, 5));
    return moovAtEnd ? Buffer.concat([ftyp, mdat, moov]) : Buffer.concat([ftyp, moov, mdat]);
}

const dir = mkdtempSync(join(tmpdir(), 'aura-fs-media-'));
const write = (name, buf) => {
    const p = join(dir, name);
    writeFileSync(p, buf);
    return p;
};

try {
    // ── 1. EXIF date strings ─────────────────────────────────────────────────
    eq('offset +02:00 is applied', parseExifDate('2024:07:14 18:03:22', '+02:00'), Date.UTC(2024, 6, 14, 16, 3, 22));
    eq('offset -05:30 is applied', parseExifDate('2024:07:14 18:03:22', '-05:30'), Date.UTC(2024, 6, 14, 23, 33, 22));
    eq('no offset = local time', parseExifDate('2024:07:14 18:03:22'), new Date(2024, 6, 14, 18, 3, 22).getTime());
    eq('zeroed camera date is rejected', parseExifDate('0000:00:00 00:00:00'), null);
    eq('unset camera clock (1970) is rejected', parseExifDate('1970:01:01 00:00:00', '+00:00'), null);
    eq('date in the future is rejected', parseExifDate('2999:01:01 00:00:00', '+00:00'), null);
    eq('garbage is rejected', parseExifDate('yesterday'), null);

    // ── 2. Containers ────────────────────────────────────────────────────────
    const shot = Date.UTC(2023, 4, 1, 10, 0, 0);
    const t = (o) => tiff({ original: '2023:05:01 12:00:00', offset: '+02:00', ...o });
    eq('JPEG little endian', await readMediaDate(write('a.jpg', jpeg(t({ le: true })))), shot);
    eq('JPEG big endian', await readMediaDate(write('b.jpg', jpeg(t({ le: false })))), shot);
    eq(
        'JPEG without DateTimeOriginal falls back to DateTime',
        await readMediaDate(write('c.jpg', jpeg(tiff({ modified: '2022:01:02 03:04:05' })))),
        new Date(2022, 0, 2, 3, 4, 5).getTime(),
    );
    eq(
        'DateTimeOriginal wins over DateTime',
        await readMediaDate(write('d.jpg', jpeg(t({ modified: '2025:01:01 00:00:00' })))),
        shot,
    );
    eq('JPEG without EXIF → null', await readMediaDate(write('e.jpg', jpeg(null))), null);
    eq('PNG eXIf chunk', await readMediaDate(write('f.png', png(t({})))), shot);
    eq('WebP EXIF chunk behind the image data', await readMediaDate(write('g.webp', webp(t({ le: false })))), shot);
    eq(
        'WebP EXIF chunk with Exif prefix',
        await readMediaDate(write('h.webp', webp(Buffer.concat([Buffer.from('Exif\0\0', 'latin1'), t({})])))),
        shot,
    );
    const vid = Date.UTC(2021, 8, 9, 7, 6, 5) / 1000;
    eq('mp4 moov in front', await readMediaDate(write('i.mp4', mp4({ epochSec: vid }))), vid * 1000);
    eq('mp4 moov at the end', await readMediaDate(write('j.mp4', mp4({ epochSec: vid, moovAtEnd: true }))), vid * 1000);
    eq('mp4 mvhd version 1', await readMediaDate(write('k.mov', mp4({ epochSec: vid, version: 1 }))), vid * 1000);
    eq('mp4 without creation time → null', await readMediaDate(write('l.mp4', mp4({ epochSec: -2082844800 }))), null);
    eq('truncated JPEG → null', await readMediaDate(write('m.jpg', jpeg(t({})).subarray(0, 30))), null);
    eq('random bytes → null', await readMediaDate(write('n.jpg', Buffer.alloc(500, 0x42))), null);
    eq('missing file → null', await readMediaDate(join(dir, 'nope.jpg')), null);

    // ── 3. Folder scan ───────────────────────────────────────────────────────
    const root = join(dir, 'photos');
    mkdirSync(join(root, '2024', 'summer'), { recursive: true });
    mkdirSync(join(root, '@eaDir'), { recursive: true });
    mkdirSync(join(root, '.thumbs'), { recursive: true });
    writeFileSync(join(root, 'one.JPG'), jpeg(null));
    writeFileSync(join(root, 'clip.mp4'), mp4({ epochSec: vid }));
    writeFileSync(join(root, 'notes.txt'), 'x');
    writeFileSync(join(root, '.hidden.jpg'), jpeg(null));
    writeFileSync(join(root, '@eaDir', 'thumb.jpg'), jpeg(null));
    writeFileSync(join(root, '.thumbs', 'thumb.jpg'), jpeg(null));
    writeFileSync(join(root, '2024', 'two.webp'), webp(t({})));
    writeFileSync(join(root, '2024', 'summer', 'three.png'), png(t({})));
    const inside = (p) => p.startsWith(root);

    const flat = await scanFolder(root, { recursive: false, isAllowed: inside });
    eq(
        'flat: only media of the folder itself',
        flat.files.map((f) => f.name),
        ['clip.mp4', 'one.JPG'],
    );
    eq(
        'kind by extension',
        flat.files.map((f) => f.kind),
        ['video', 'image'],
    );
    const deep = await scanFolder(root, { recursive: true, isAllowed: inside });
    eq('recursive: subfolders, no hidden/NAS folders', deep.files.map((f) => f.name).sort(), [
        'clip.mp4',
        'one.JPG',
        'three.png',
        'two.webp',
    ]);
    const shallow = await scanFolder(root, { recursive: true, isAllowed: inside, maxDepth: 1 });
    eq('depth limit', shallow.files.map((f) => f.name).sort(), ['clip.mp4', 'one.JPG', 'two.webp']);
    const capped = await scanFolder(root, { recursive: true, isAllowed: inside, maxFiles: 2 });
    eq('file limit sets truncated', [capped.files.length, capped.truncated], [2, true]);
    eq('mediaKind', [mediaKind('x.HEIC'), mediaKind('y.mov'), mediaKind('z.avif')], [null, 'video', 'image']);

    // symlink leaving the roots is not followed (needs symlink rights on Windows)
    const outside = join(dir, 'outside');
    mkdirSync(outside);
    writeFileSync(join(outside, 'secret.jpg'), jpeg(null));
    let linked = false;
    try {
        symlinkSync(outside, join(root, 'link'), 'junction');
        linked = true;
    } catch {
        console.log('  skip  symlink check (no symlink rights)');
    }
    if (linked) {
        const viaLink = await scanFolder(root, { recursive: true, isAllowed: inside });
        check('symlink out of the roots is skipped', !viaLink.files.some((f) => f.name === 'secret.jpg'));
    }

    // ── 4. Library: dates in the background, cache on disk ───────────────────
    const dataDir = join(dir, 'data');
    let reads = 0;
    const lib = createMediaLibrary({
        dataDir,
        isAllowed: inside,
        readDate: async (p) => {
            reads++;
            return readMediaDate(p);
        },
    });
    const first = await lib.list(root, true);
    eq(
        'first answer: all pending, file dates',
        [first.pending, first.items.every((i) => i.dateSource === 'mtime')],
        [4, true],
    );
    await lib.idle();
    const second = await lib.list(root, true);
    eq('second answer: nothing pending', second.pending, 0);
    const byName = Object.fromEntries(second.items.map((i) => [i.name, i]));
    eq('webp date from EXIF', [byName['two.webp'].time, byName['two.webp'].dateSource], [shot, 'exif']);
    eq('video date from mvhd', [byName['clip.mp4'].time, byName['clip.mp4'].dateSource], [vid * 1000, 'exif']);
    eq('jpeg without EXIF keeps the file date', byName['one.JPG'].dateSource, 'mtime');
    eq('each file read once', reads, 4);
    await lib.flush();
    check('cache file written', existsSync(join(dataDir, 'media-dates.json')));
    const cached = JSON.parse(readFileSync(join(dataDir, 'media-dates.json'), 'utf8'));
    eq('cache holds every file', Object.keys(cached).length, 4);

    let reads2 = 0;
    const lib2 = createMediaLibrary({
        dataDir,
        isAllowed: inside,
        readDate: async () => {
            reads2++;
            return null;
        },
    });
    const restarted = await lib2.list(root, true);
    eq('after restart: dates from the cache, nothing read', [restarted.pending, reads2], [0, 0]);

    // ── 5. Byte ranges ───────────────────────────────────────────────────────
    eq('no header', parseRange(undefined, 100), null);
    eq('open end', parseRange('bytes=0-', 100), { start: 0, end: 99 });
    eq('closed', parseRange('bytes=10-19', 100), { start: 10, end: 19 });
    eq('end clamped', parseRange('bytes=90-500', 100), { start: 90, end: 99 });
    eq('suffix', parseRange('bytes=-10', 100), { start: 90, end: 99 });
    eq('start past end', parseRange('bytes=100-', 100), 'unsatisfiable');
    eq('reversed', parseRange('bytes=50-10', 100), 'unsatisfiable');
    eq('multi-range = whole file', parseRange('bytes=0-1,5-6', 100), null);
} finally {
    rmSync(dir, { recursive: true, force: true });
}

const failed = results.filter((r) => !r.ok);
console.log(`\n${results.length - failed.length}/${results.length} passed`);
process.exit(failed.length ? 1 : 0);
