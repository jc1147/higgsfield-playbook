param([string]$src, [string]$dst)
Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System; using System.Collections.Generic; using System.Drawing; using System.Drawing.Imaging; using System.Runtime.InteropServices;
public static class Cutout {
  // Removes only the white background CONNECTED to the image border (enclosed white shapes survive),
  // then un-mixes white from the 2px fringe so edges don't halo on dark backgrounds.
  public static int Run(string src, string dst) {
    using (var input = new Bitmap(src)) using (var bmp = new Bitmap(input.Width, input.Height, PixelFormat.Format32bppArgb)) {
      using (var g = Graphics.FromImage(bmp)) g.DrawImage(input, 0, 0, input.Width, input.Height);
      int w = bmp.Width, h = bmp.Height;
      var data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadWrite, PixelFormat.Format32bppArgb);
      var px = new byte[w * h * 4]; Marshal.Copy(data.Scan0, px, 0, px.Length);
      Func<int, int> minc = i => Math.Min(px[i], Math.Min(px[i + 1], px[i + 2]));
      var bg = new bool[w * h]; var q = new Queue<int>();
      for (int x = 0; x < w; x++) { q.Enqueue(x); q.Enqueue((h - 1) * w + x); }
      for (int y = 0; y < h; y++) { q.Enqueue(y * w); q.Enqueue(y * w + w - 1); }
      while (q.Count > 0) {
        int p = q.Dequeue(); if (bg[p] || minc(p * 4) < 225) continue; bg[p] = true;
        int x = p % w, y = p / w;
        if (x > 0) q.Enqueue(p - 1); if (x < w - 1) q.Enqueue(p + 1); if (y > 0) q.Enqueue(p - w); if (y < h - 1) q.Enqueue(p + w);
      }
      int removed = 0;
      for (int p = 0; p < w * h; p++) if (bg[p]) { px[p * 4 + 3] = 0; removed++; }
      for (int p = 0; p < w * h; p++) {
        if (bg[p]) continue; int x = p % w, y = p / w; bool fringe = false;
        for (int dy = -2; dy <= 2 && !fringe; dy++) for (int dx = -2; dx <= 2; dx++) {
          int nx = x + dx, ny = y + dy; if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue; if (bg[ny * w + nx]) { fringe = true; break; }
        }
        if (!fringe) continue; int i = p * 4; double a = (255.0 - minc(i)) / 255.0; if (a < 0.02) { px[i + 3] = 0; continue; }
        for (int c = 0; c < 3; c++) px[i + c] = (byte)Math.Max(0, Math.Min(255, (px[i + c] - (1 - a) * 255) / a));
        px[i + 3] = (byte)(a * 255);
      }
      Marshal.Copy(px, 0, data.Scan0, px.Length); bmp.UnlockBits(data); bmp.Save(dst, ImageFormat.Png);
      return (int)Math.Round(100.0 * removed / (w * h));
    }
  }
}
"@
"background removed: $([Cutout]::Run($src, $dst))% of pixels -> $dst"
