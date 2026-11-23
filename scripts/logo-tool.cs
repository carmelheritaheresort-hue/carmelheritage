// Helper used once to derive web logo files from the supplied master PNG.
// Compiled on the fly from PowerShell (Add-Type). Not part of the running website.
using System;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;
using System.Collections.Generic;

public static class LogoTool
{
    static byte[] Load(string path, out int w, out int h)
    {
        using (var src = new Bitmap(path))
        using (var bmp = new Bitmap(src.Width, src.Height, PixelFormat.Format32bppArgb))
        {
            using (var g = Graphics.FromImage(bmp)) { g.Clear(Color.White); g.DrawImage(src, 0, 0, src.Width, src.Height); }
            w = bmp.Width; h = bmp.Height;
            var d = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
            var buf = new byte[d.Stride * h];
            Marshal.Copy(d.Scan0, buf, 0, buf.Length);
            bmp.UnlockBits(d);
            return buf;
        }
    }

    static int Lum(byte[] b, int i) { return (b[i + 2] * 299 + b[i + 1] * 587 + b[i] * 114) / 1000; }

    // Returns "y0-y1;y0-y1;..." bands of rows containing ink, split by gaps of at least minGap rows.
    public static string Bands(string path, int minGap)
    {
        int w, h; var b = Load(path, out w, out h);
        var bands = new List<string>();
        int start = -1, lastInk = -1;
        for (int y = 0; y < h; y++)
        {
            bool ink = false;
            for (int x = 0; x < w && !ink; x++) if (Lum(b, (y * w + x) * 4) < 160) ink = true;
            if (ink) { if (start < 0) start = y; lastInk = y; }
            else if (start >= 0 && y - lastInk >= minGap) { bands.Add(start + "-" + lastInk); start = -1; }
        }
        if (start >= 0) bands.Add(start + "-" + lastInk);
        return string.Join(";", bands);
    }

    // Crops rows y0..y1 (tight on columns), removes the white background and writes a transparent PNG.
    // tint: "" keeps original colours; otherwise "#rrggbb" recolours all ink. pad: transparent padding in px.
    public static string Make(string path, string dst, int y0, int y1, string tint, int maxW, int pad)
    {
        int w, h; var b = Load(path, out w, out h);
        int x0 = w, x1 = -1;
        for (int y = y0; y <= y1; y++)
            for (int x = 0; x < w; x++)
                if (Lum(b, (y * w + x) * 4) < 160) { if (x < x0) x0 = x; if (x > x1) x1 = x; }
        int cw = x1 - x0 + 1, ch = y1 - y0 + 1;
        int ow = cw + pad * 2, oh = ch + pad * 2;
        using (var outBmp = new Bitmap(ow, oh, PixelFormat.Format32bppArgb))
        {
            var d = outBmp.LockBits(new Rectangle(0, 0, ow, oh), ImageLockMode.WriteOnly, PixelFormat.Format32bppArgb);
            var o = new byte[d.Stride * oh];
            Color t = tint.Length > 0 ? ColorTranslator.FromHtml(tint) : Color.Empty;
            for (int y = 0; y < ch; y++)
                for (int x = 0; x < cw; x++)
                {
                    int si = ((y + y0) * w + (x + x0)) * 4;
                    int di = (y + pad) * d.Stride + (x + pad) * 4;
                    // Alpha from darkness: white (>=245) is transparent, ink (<=90) is opaque.
                    int L = Lum(b, si);
                    double a = (245.0 - L) / (245.0 - 90.0);
                    if (a <= 0) continue;
                    if (a > 1) a = 1;
                    byte r, g, bl;
                    if (tint.Length > 0) { r = t.R; g = t.G; bl = t.B; }
                    else
                    {
                        // Un-mix the white background from anti-aliased edge pixels.
                        Func<int, byte> un = c => (byte)Math.Max(0, Math.Min(255, (c - (1 - a) * 255) / a));
                        r = un(b[si + 2]); g = un(b[si + 1]); bl = un(b[si]);
                    }
                    o[di] = bl; o[di + 1] = g; o[di + 2] = r; o[di + 3] = (byte)Math.Round(a * 255);
                }
            Marshal.Copy(o, 0, d.Scan0, o.Length);
            outBmp.UnlockBits(d);

            double s = Math.Min(1.0, (double)maxW / ow);
            int fw = (int)Math.Round(ow * s), fh = (int)Math.Round(oh * s);
            using (var fin = new Bitmap(fw, fh, PixelFormat.Format32bppArgb))
            {
                using (var g2 = Graphics.FromImage(fin))
                {
                    g2.Clear(Color.Transparent);
                    g2.InterpolationMode = System.Drawing.Drawing2D.InterpolationMode.HighQualityBicubic;
                    g2.PixelOffsetMode = System.Drawing.Drawing2D.PixelOffsetMode.HighQuality;
                    g2.CompositingMode = System.Drawing.Drawing2D.CompositingMode.SourceCopy;
                    g2.DrawImage(outBmp, 0, 0, fw, fh);
                }
                fin.Save(dst, ImageFormat.Png);
            }
            return dst + " " + fw + "x" + fh;
        }
    }
}
