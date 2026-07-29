const fs = require("node:fs");
const path = require("node:path");
const sharp = require("sharp");

const DOOM_PALETTE = [
  [0, 0, 0], [31, 23, 11], [23, 15, 7], [15, 7, 0],
  [255, 255, 255], [239, 239, 239], [223, 223, 223], [207, 207, 207],
  [191, 191, 191], [175, 175, 175], [159, 159, 159], [143, 143, 143],
  [127, 127, 127], [111, 111, 111], [95, 95, 95], [79, 79, 79],
  [63, 63, 63], [47, 47, 47], [31, 31, 31], [15, 15, 15],
  [255, 0, 0], [239, 0, 0], [223, 0, 0], [207, 0, 0],
  [191, 0, 0], [175, 0, 0], [159, 0, 0], [143, 0, 0],
  [127, 0, 0], [111, 0, 0], [95, 0, 0], [79, 0, 0],
  [63, 0, 0], [47, 0, 0], [31, 0, 0], [15, 0, 0],
  [255, 127, 0], [239, 119, 0], [223, 111, 0], [207, 103, 0],
  [191, 95, 0], [175, 87, 0], [159, 79, 0], [143, 71, 0],
  [127, 63, 0], [111, 55, 0], [95, 47, 0], [79, 39, 0],
  [63, 31, 0], [47, 23, 0], [31, 15, 0], [15, 7, 0],
  [255, 255, 0], [239, 239, 0], [223, 223, 0], [207, 207, 0],
  [191, 191, 0], [175, 175, 0], [159, 159, 0], [143, 143, 0],
  [127, 127, 0], [111, 111, 0], [95, 95, 0], [79, 79, 0],
  [63, 63, 0], [47, 47, 0], [31, 31, 0], [15, 15, 0],
  [0, 255, 0], [0, 239, 0], [0, 223, 0], [0, 207, 0],
  [0, 191, 0], [0, 175, 0], [0, 159, 0], [0, 143, 0],
  [0, 127, 0], [0, 111, 0], [0, 95, 0], [0, 79, 0],
  [0, 63, 0], [0, 47, 0], [0, 31, 0], [0, 15, 0],
  [0, 0, 255], [0, 0, 239], [0, 0, 223], [0, 0, 207],
  [0, 0, 191], [0, 0, 175], [0, 0, 159], [0, 0, 143],
  [0, 0, 127], [0, 0, 111], [0, 0, 95], [0, 0, 79],
  [0, 0, 63], [0, 0, 47], [0, 0, 31], [0, 0, 15],
  [139, 69, 19], [160, 82, 45], [205, 133, 63], [222, 184, 135],
  [245, 222, 179], [255, 228, 196], [255, 235, 205], [255, 245, 238],
];

while (DOOM_PALETTE.length < 256) {
  const i = DOOM_PALETTE.length;
  DOOM_PALETTE.push([i, i, i]);
}

function nearestColor(r, g, b) {
  let min = Infinity;
  let idx = 0;
  for (let i = 0; i < 256; i++) {
    const [pr, pg, pb] = DOOM_PALETTE[i];
    const dist = (r - pr) ** 2 + (g - pg) ** 2 + (b - pb) ** 2;
    if (dist < min) {
      min = dist;
      idx = i;
    }
  }
  return idx;
}

function rgbaToDoomPatch(rgbaBuf, width, height, leftOffset = 0, topOffset = 0) {
  const columnOffsets = new Uint32Array(width);
  const postsData = [];
  
  const headerSize = 8;
  const colOffsetTableSize = width * 4;
  let currentOffset = headerSize + colOffsetTableSize;

  for (let x = 0; x < width; x++) {
    columnOffsets[x] = currentOffset;
    
    const postPixels = new Uint8Array(height);
    for (let y = 0; y < height; y++) {
      const idx = (y * width + x) * 4;
      const r = rgbaBuf[idx];
      const g = rgbaBuf[idx + 1];
      const b = rgbaBuf[idx + 2];
      postPixels[y] = nearestColor(r, g, b);
    }
    
    const post = Buffer.concat([
      Buffer.from([0, height, 0]),
      postPixels,
      Buffer.from([0, 255])
    ]);
    
    postsData.push(post);
    currentOffset += post.length;
  }

  const header = Buffer.alloc(8);
  header.writeUInt16LE(width, 0);
  header.writeUInt16LE(height, 2);
  header.writeInt16LE(leftOffset, 4);
  header.writeInt16LE(topOffset, 6);

  const colOffsetBuf = Buffer.alloc(colOffsetTableSize);
  for (let x = 0; x < width; x++) {
    colOffsetBuf.writeUInt32LE(columnOffsets[x], x * 4);
  }

  return Buffer.concat([header, colOffsetBuf, ...postsData]);
}

async function buildWad() {
  const publicDir = path.resolve(__dirname, "..", "public");
  const modsDir = path.join(publicDir, "mods");
  fs.mkdirSync(modsDir, { recursive: true });

  const faceImgPath = path.join(publicDir, "images", "doom", "duhaime_face.jpg");
  const logoImgPath = path.join(publicDir, "images", "doom", "duhaime_logo.jpg");

  // Resize and load raw RGBA buffers
  const faceBuf = await sharp(faceImgPath).resize(24, 31).ensureAlpha().raw().toBuffer();
  const logoBuf = await sharp(logoImgPath).resize(320, 100).ensureAlpha().raw().toBuffer();

  const facePatch = rgbaToDoomPatch(faceBuf, 24, 31);
  const logoPatch = rgbaToDoomPatch(logoBuf, 320, 100);

  // Status bar face lumps to replace
  const faceLumpNames = [
    "STFST00", "STFST01", "STFST02",
    "STFST10", "STFST11", "STFST12",
    "STFST20", "STFST21", "STFST22",
    "STFST30", "STFST31", "STFST32",
    "STFST40", "STFST41", "STFST42",
    "STFTR00", "STFTL00", "STFOUCH0", "STFEVL0", "STFKILL0"
  ];

  const lumps = [
    { name: "M_DOOM", data: logoPatch }
  ];

  for (const fName of faceLumpNames) {
    lumps.push({ name: fName, data: facePatch });
  }

  // Pack PWAD
  const headerSize = 12;
  let dataOffset = headerSize;
  const lumpDataBuffers = [];
  const dirEntries = [];

  for (const lump of lumps) {
    const len = lump.data.length;
    dirEntries.push({
      offset: dataOffset,
      size: len,
      name: lump.name.padEnd(8, "\0").slice(0, 8)
    });
    lumpDataBuffers.push(lump.data);
    dataOffset += len;
  }

  const dirOffset = dataOffset;
  const dirBuf = Buffer.alloc(lumps.length * 16);
  
  dirEntries.forEach((entry, idx) => {
    const base = idx * 16;
    dirBuf.writeUInt32LE(entry.offset, base);
    dirBuf.writeUInt32LE(entry.size, base + 4);
    dirBuf.write(entry.name, base + 8, 8, "ascii");
  });

  const header = Buffer.alloc(12);
  header.write("PWAD", 0, 4, "ascii");
  header.writeUInt32LE(lumps.length, 4);
  header.writeUInt32LE(dirOffset, 8);

  const wadFile = Buffer.concat([header, ...lumpDataBuffers, dirBuf]);
  const outPath = path.join(modsDir, "duhaime.wad");
  fs.writeFileSync(outPath, wadFile);

  console.log(`✅ duhaime.wad généré avec succès (${wadFile.length} octets) -> ${outPath}`);
}

buildWad().catch(console.error);
