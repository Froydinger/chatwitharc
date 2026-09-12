const encoder = new TextEncoder();

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of data) {
    let value = (crc ^ byte) & 0xff;
    for (let bit = 0; bit < 8; bit++) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    crc = (crc >>> 8) ^ value;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

/** Small, deterministic, store-only ZIP writer for Netlify deploy archives. */
export function zipEntries(entries: Array<{ name: string; data: Uint8Array }>): Uint8Array {
  if (!entries.length || entries.length > 256) throw new Error('Invalid deploy archive.');
  const local: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;
  for (const entry of entries) {
    if (!entry.name || entry.name.includes('..') || entry.name.startsWith('/') || entry.name.includes('\\')) {
      throw new Error('Invalid deploy archive path.');
    }
    const name = encoder.encode(entry.name);
    const checksum = crc32(entry.data);
    const header = new Uint8Array(30 + name.length);
    const view = new DataView(header.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(4, 20, true);
    view.setUint16(6, 0x800, true);
    view.setUint32(14, checksum, true);
    view.setUint32(18, entry.data.length, true);
    view.setUint32(22, entry.data.length, true);
    view.setUint16(26, name.length, true);
    header.set(name, 30);
    local.push(header);

    const directory = new Uint8Array(46 + name.length);
    const directoryView = new DataView(directory.buffer);
    directoryView.setUint32(0, 0x02014b50, true);
    directoryView.setUint16(4, 20, true);
    directoryView.setUint16(6, 20, true);
    directoryView.setUint16(8, 0x800, true);
    directoryView.setUint32(16, checksum, true);
    directoryView.setUint32(20, entry.data.length, true);
    directoryView.setUint32(24, entry.data.length, true);
    directoryView.setUint16(28, name.length, true);
    directoryView.setUint32(42, offset, true);
    directory.set(name, 46);
    central.push(directory);
    offset += header.length + entry.data.length;
  }
  const centralSize = central.reduce((sum, item) => sum + item.length, 0);
  const end = new Uint8Array(22);
  const endView = new DataView(end.buffer);
  endView.setUint32(0, 0x06054b50, true);
  endView.setUint16(8, entries.length, true);
  endView.setUint16(10, entries.length, true);
  endView.setUint32(12, centralSize, true);
  endView.setUint32(16, offset, true);
  const result = new Uint8Array(offset + centralSize + end.length);
  let cursor = 0;
  for (let index = 0; index < entries.length; index++) {
    result.set(local[index], cursor); cursor += local[index].length;
    result.set(entries[index].data, cursor); cursor += entries[index].data.length;
  }
  for (const directory of central) { result.set(directory, cursor); cursor += directory.length; }
  result.set(end, cursor);
  return result;
}
