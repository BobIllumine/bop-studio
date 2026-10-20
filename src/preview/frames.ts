/**
 * Reading a generated dataset in the browser: which frames a job stored, and
 * decoders for the two channels browsers cannot show as they are.
 *
 * Depth is a single-channel float `Z` OpenEXR (tiled or scanline, RLE or
 * uncompressed, as the `exr` crate writes it); instance labels are 16-bit
 * grayscale PNG, which `<img>` would reduce to 8 bits.
 */

export type Channel = "rgb" | "depth" | "instance";

export const CHANNEL_FILE: Record<Channel, string> = { rgb: "rgb.png", depth: "depth.exr", instance: "instance.png" };

export interface FrameFiles {
  camera: number;
  /** Stored path of each channel present, relative to the job. */
  paths: Partial<Record<Channel, string>>;
}

export interface SceneFiles {
  scene: number;
  /** `scenes/<id>/scene.json`, if stored. */
  metadata?: string;
  frames: FrameFiles[];
}

const FRAME_PATH = /^scenes\/(\d+)\/frames\/(\d+)\/(rgb\.png|depth\.exr|instance\.png)$/;
const SCENE_PATH = /^scenes\/(\d+)\/scene\.json$/;

/** Groups a job's stored files into scenes and cameras, both in ascending order. */
export function indexScenes(paths: string[]): SceneFiles[] {
  const scenes = new Map<number, { metadata?: string; frames: Map<number, FrameFiles> }>();
  const scene = (id: number) => {
    let entry = scenes.get(id);
    if (!entry) scenes.set(id, (entry = { frames: new Map() }));
    return entry;
  };
  for (const path of paths) {
    const frame = FRAME_PATH.exec(path);
    if (frame) {
      const frames = scene(Number(frame[1])).frames;
      const camera = Number(frame[2]);
      let entry = frames.get(camera);
      if (!entry) frames.set(camera, (entry = { camera, paths: {} }));
      const channel = (Object.keys(CHANNEL_FILE) as Channel[]).find((c) => CHANNEL_FILE[c] === frame[3])!;
      entry.paths[channel] = path;
      continue;
    }
    const metadata = SCENE_PATH.exec(path);
    if (metadata) scene(Number(metadata[1])).metadata = path;
  }
  return [...scenes.entries()]
    .filter(([, entry]) => entry.frames.size > 0)
    .sort(([a], [b]) => a - b)
    .map(([id, entry]) => ({
      scene: id,
      metadata: entry.metadata,
      frames: [...entry.frames.values()].sort((a, b) => a.camera - b.camera),
    }));
}

export interface DepthImage {
  width: number;
  height: number;
  /** Row-major camera-Z metres; 0 is background. */
  metres: Float32Array;
}

export interface LabelImage {
  width: number;
  height: number;
  /** Row-major instance IDs; 0 is background. */
  labels: Uint16Array;
}

async function inflate(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new Blob([data]).stream().pipeThrough(new DecompressionStream("deflate"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/** Decodes a non-interlaced 16-bit grayscale PNG. */
export async function decodeGray16Png(buffer: ArrayBuffer): Promise<LabelImage> {
  const bytes = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const signature = [137, 80, 78, 71, 13, 10, 26, 10];
  if (!signature.every((b, i) => bytes[i] === b)) throw new Error("not a PNG file");
  let width = 0;
  let height = 0;
  const idat: Uint8Array<ArrayBuffer>[] = [];
  for (let offset = 8; offset + 8 <= bytes.length; ) {
    const length = view.getUint32(offset);
    const type = String.fromCharCode(...bytes.subarray(offset + 4, offset + 8));
    const data = bytes.subarray(offset + 8, offset + 8 + length);
    if (type === "IHDR") {
      width = view.getUint32(offset + 8);
      height = view.getUint32(offset + 12);
      const [depth, color, , , interlace] = data.subarray(8, 13);
      if (depth !== 16 || color !== 0 || interlace !== 0) {
        throw new Error(`expected a 16-bit grayscale PNG, got bit depth ${depth}, colour type ${color}`);
      }
    } else if (type === "IDAT") {
      idat.push(data);
    } else if (type === "IEND") {
      break;
    }
    offset += 12 + length;
  }
  const raw = await inflate(new Uint8Array(await new Blob(idat).arrayBuffer()));
  const stride = width * 2;
  if (raw.length !== (stride + 1) * height) throw new Error("PNG image data has the wrong length");
  const pixels = new Uint8Array(stride * height);
  for (let y = 0; y < height; y++) {
    const filter = raw[y * (stride + 1)];
    const line = raw.subarray(y * (stride + 1) + 1, (y + 1) * (stride + 1));
    const out = pixels.subarray(y * stride, (y + 1) * stride);
    const up = y > 0 ? pixels.subarray((y - 1) * stride, y * stride) : new Uint8Array(stride);
    for (let i = 0; i < stride; i++) {
      const a = i >= 2 ? out[i - 2]! : 0;
      const b = up[i]!;
      const c = i >= 2 ? up[i - 2]! : 0;
      let predictor: number;
      switch (filter) {
        case 0: predictor = 0; break;
        case 1: predictor = a; break;
        case 2: predictor = b; break;
        case 3: predictor = (a + b) >> 1; break;
        case 4: {
          const p = a + b - c;
          const pa = Math.abs(p - a);
          const pb = Math.abs(p - b);
          const pc = Math.abs(p - c);
          predictor = pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
          break;
        }
        default:
          throw new Error(`unknown PNG filter ${filter}`);
      }
      out[i] = (line[i]! + predictor) & 0xff;
    }
  }
  const labels = new Uint16Array(width * height);
  for (let i = 0; i < labels.length; i++) labels[i] = (pixels[2 * i]! << 8) | pixels[2 * i + 1]!;
  return { width, height, labels };
}

/** OpenEXR RLE: run-length decode, undo the byte predictor, then re-interleave the two halves. */
function exrRle(data: Uint8Array, size: number): Uint8Array {
  const t = new Uint8Array(size);
  let o = 0;
  for (let i = 0; i < data.length && o < size; ) {
    const count = (data[i++]! << 24) >> 24;
    if (count < 0) {
      t.set(data.subarray(i, i - count), o);
      o -= count;
      i -= count;
    } else {
      t.fill(data[i++]!, o, o + count + 1);
      o += count + 1;
    }
  }
  if (o !== size) throw new Error("EXR RLE block has the wrong length");
  for (let i = 1; i < size; i++) t[i] = (t[i - 1]! + t[i]! - 128) & 0xff;
  const out = new Uint8Array(size);
  const half = (size + 1) >> 1;
  for (let i = 0; i < size; i++) out[i] = i % 2 === 0 ? t[i >> 1]! : t[half + (i >> 1)]!;
  return out;
}

/** Decodes the single-channel float depth EXR the dataset stores. */
export function decodeDepthExr(buffer: ArrayBuffer): DepthImage {
  const view = new DataView(buffer);
  const bytes = new Uint8Array(buffer);
  if (view.getUint32(0, true) !== 20000630) throw new Error("not an OpenEXR file");
  const flags = view.getUint32(4, true);
  const tiled = (flags & 0x200) !== 0;
  if (flags & 0x1800) throw new Error("multi-part and deep EXR files are not supported");

  let offset = 8;
  const cString = () => {
    const end = bytes.indexOf(0, offset);
    const text = String.fromCharCode(...bytes.subarray(offset, end));
    offset = end + 1;
    return text;
  };
  let channels: { name: string; type: number }[] = [];
  let compression = -1;
  let window = [0, 0, 0, 0];
  let tile = [0, 0];
  for (;;) {
    const name = cString();
    if (!name) break;
    cString(); // attribute type
    const size = view.getInt32(offset, true);
    const start = (offset += 4);
    if (name === "channels") {
      channels = [];
      while (bytes[offset] !== 0) {
        const channel = cString();
        channels.push({ name: channel, type: view.getInt32(offset, true) });
        offset += 16;
      }
    } else if (name === "compression") {
      compression = bytes[offset]!;
    } else if (name === "dataWindow") {
      window = [0, 1, 2, 3].map((i) => view.getInt32(start + 4 * i, true));
    } else if (name === "tiles") {
      tile = [view.getUint32(start, true), view.getUint32(start + 4, true)];
      if ((bytes[start + 8]! & 0xf) !== 0) throw new Error("only single-level tiled EXR files are supported");
    }
    offset = start + size;
  }
  if (channels.length !== 1 || channels[0]!.type !== 2) {
    throw new Error(`expected one float channel, found ${channels.map((c) => c.name).join(", ") || "none"}`);
  }
  if (compression !== 0 && compression !== 1) throw new Error(`unsupported EXR compression ${compression}`);

  const [x0, y0, x1, y1] = window as [number, number, number, number];
  const width = x1 - x0 + 1;
  const height = y1 - y0 + 1;
  const metres = new Float32Array(width * height);
  const [tw, th] = tiled ? (tile as [number, number]) : [width, 1];
  const chunks = tiled ? Math.ceil(width / tw) * Math.ceil(height / th) : height;
  const table = offset;
  for (let chunk = 0; chunk < chunks; chunk++) {
    let at = Number(view.getBigUint64(table + 8 * chunk, true));
    let px: number;
    let py: number;
    if (tiled) {
      px = view.getInt32(at, true) * tw;
      py = view.getInt32(at + 4, true) * th;
      at += 16;
    } else {
      px = 0;
      py = view.getInt32(at, true) - y0;
      at += 4;
    }
    const packed = view.getInt32(at, true);
    const data = bytes.subarray(at + 4, at + 4 + packed);
    const w = Math.min(tw, width - px);
    const h = Math.min(th, height - py);
    const size = w * h * 4;
    const block = compression === 1 && packed < size ? exrRle(data, size) : data;
    const floats = new DataView(block.buffer, block.byteOffset, block.byteLength);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) metres[(py + y) * width + px + x] = floats.getFloat32((y * w + x) * 4, true);
    }
  }
  return { width, height, metres };
}

/** Turbo colormap (Mikhailov 2019), polynomial approximation, t in [0, 1]. */
function turbo(t: number): [number, number, number] {
  const r = 0.1357 + t * (4.5974 - t * (42.3277 - t * (130.5887 - t * (150.5666 - t * 58.1375))));
  const g = 0.0914 + t * (2.1856 + t * (4.8052 - t * (14.0195 - t * (4.2109 + t * 2.7747))));
  const b = 0.1067 + t * (12.5925 - t * (60.1097 - t * (109.0745 - t * (88.5066 - t * 26.8183))));
  return [r, g, b].map((v) => Math.round(255 * Math.min(1, Math.max(0, v)))) as [number, number, number];
}

const BACKGROUND = [11, 12, 14, 255];

/** The nearest and farthest foreground depth, for colouring. */
export function depthRange(depth: DepthImage): [number, number] {
  let near = Infinity;
  let far = 0;
  for (const d of depth.metres) {
    if (d > 0) {
      if (d < near) near = d;
      if (d > far) far = d;
    }
  }
  return near <= far ? [near, far] : [0, 1];
}

/** Colours depth near (red) to far (blue); background stays dark. */
export function depthRgba(depth: DepthImage): Uint8ClampedArray<ArrayBuffer> {
  const [near, far] = depthRange(depth);
  const span = far - near || 1;
  const rgba = new Uint8ClampedArray(depth.metres.length * 4);
  depth.metres.forEach((d, i) => {
    const [r, g, b] = d > 0 ? turbo(1 - (d - near) / span) : BACKGROUND;
    rgba.set([r!, g!, b!, 255], i * 4);
  });
  return rgba;
}

/** A stable, well-separated colour for an instance ID. */
export function labelColor(id: number): [number, number, number] {
  const hue = (id * 0.618033988749895) % 1;
  const [s, l] = [0.65, id % 2 ? 0.58 : 0.46];
  const k = (n: number) => (n + hue * 12) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1));
  return [f(0), f(8), f(4)].map((v) => Math.round(v * 255)) as [number, number, number];
}

/** Colours each visible instance; background stays dark. */
export function labelRgba(image: LabelImage): Uint8ClampedArray<ArrayBuffer> {
  const rgba = new Uint8ClampedArray(image.labels.length * 4);
  const cache = new Map<number, [number, number, number]>();
  image.labels.forEach((id, i) => {
    if (id === 0) return rgba.set(BACKGROUND, i * 4);
    let color = cache.get(id);
    if (!color) cache.set(id, (color = labelColor(id)));
    rgba.set([...color, 255], i * 4);
  });
  return rgba;
}
