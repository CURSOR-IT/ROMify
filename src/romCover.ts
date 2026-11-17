/** Macht aus dem 32x32-Icon einer DS-ROM ein 256x256-Cover (scharfe Pixel auf dunklem Verlauf). */
export function renderIconCover(rgba: Uint8ClampedArray): Promise<Blob> {
  const small = document.createElement("canvas");
  small.width = small.height = 32;
  const data = new Uint8ClampedArray(rgba) as Uint8ClampedArray<ArrayBuffer>;
  small.getContext("2d")!.putImageData(new ImageData(data, 32, 32), 0, 0);
  const c = document.createElement("canvas");
  c.width = c.height = 256;
  const x = c.getContext("2d")!;
  const g = x.createLinearGradient(0, 0, 256, 256);
  g.addColorStop(0, "#1b2030");
  g.addColorStop(1, "#0b0d12");
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 256);
  x.imageSmoothingEnabled = false;
  x.drawImage(small, 32, 32, 192, 192);
  return new Promise((res, rej) => c.toBlob((b) => (b ? res(b) : rej(new Error("Cover konnte nicht erzeugt werden"))), "image/png"));
}
