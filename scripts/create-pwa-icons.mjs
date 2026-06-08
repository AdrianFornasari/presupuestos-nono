import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';

const PNG_SIGNATURE = Buffer.from([
  0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
]);

function crc32(buffer) {
  let crc = -1;

  for (let i = 0; i < buffer.length; i += 1) {
    crc ^= buffer[i];

    for (let j = 0; j < 8; j += 1) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }

  return (crc ^ -1) >>> 0;
}

function chunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);

  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);

  return Buffer.concat([length, typeBuffer, data, crc]);
}

function createIcon(size, outputPath) {
  const bytesPerPixel = 4;
  const stride = size * bytesPerPixel + 1;
  const raw = Buffer.alloc(stride * size);

  function setPixel(x, y, r, g, b, a = 255) {
    if (x < 0 || y < 0 || x >= size || y >= size) return;

    const rowStart = y * stride;
    const index = rowStart + 1 + x * bytesPerPixel;

    raw[index] = r;
    raw[index + 1] = g;
    raw[index + 2] = b;
    raw[index + 3] = a;
  }

  function rect(x, y, w, h, r, g, b, a = 255) {
    const sx = Math.round((x / 512) * size);
    const sy = Math.round((y / 512) * size);
    const sw = Math.round((w / 512) * size);
    const sh = Math.round((h / 512) * size);

    for (let yy = sy; yy < sy + sh; yy += 1) {
      for (let xx = sx; xx < sx + sw; xx += 1) {
        setPixel(xx, yy, r, g, b, a);
      }
    }
  }

  // Fondo negro accesible
  for (let y = 0; y < size; y += 1) {
    raw[y * stride] = 0; // filtro PNG
    for (let x = 0; x < size; x += 1) {
      setPixel(x, y, 5, 5, 5, 255);
    }
  }

  // Borde blanco
  rect(24, 24, 464, 24, 255, 255, 255);
  rect(24, 464, 464, 24, 255, 255, 255);
  rect(24, 24, 24, 464, 255, 255, 255);
  rect(464, 24, 24, 464, 255, 255, 255);

  // Letra I
  rect(125, 150, 100, 42, 255, 255, 255);
  rect(154, 150, 42, 220, 255, 255, 255);
  rect(125, 328, 100, 42, 255, 255, 255);

  // Letra A simplificada
  rect(285, 150, 42, 220, 255, 255, 255);
  rect(390, 150, 42, 220, 255, 255, 255);
  rect(285, 150, 147, 42, 255, 255, 255);
  rect(285, 250, 147, 42, 255, 255, 255);

  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  ihdr[10] = 0;
  ihdr[11] = 0;
  ihdr[12] = 0;

  const compressed = zlib.deflateSync(raw);

  const png = Buffer.concat([
    PNG_SIGNATURE,
    chunk('IHDR', ihdr),
    chunk('IDAT', compressed),
    chunk('IEND', Buffer.alloc(0)),
  ]);

  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, png);
  console.log(`Icono creado: ${outputPath}`);
}

const publicDir = path.resolve(process.cwd(), 'public');

createIcon(192, path.join(publicDir, 'pwa-192x192.png'));
createIcon(512, path.join(publicDir, 'pwa-512x512.png'));