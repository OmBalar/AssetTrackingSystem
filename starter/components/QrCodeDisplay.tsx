"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";

type QrCodeDisplayProps = {
  value: string;
  /** SVG width/height hint (pixels). */
  size?: number;
};

export function QrCodeDisplay({ value, size = 168 }: QrCodeDisplayProps) {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void QRCode.toString(value, {
      type: "svg",
      width: size,
      margin: 1,
      errorCorrectionLevel: "M",
      color: { dark: "#0f172a", light: "#ffffff" },
    })
      .then((s) => {
        if (!cancelled) setSvg(s);
      })
      .catch((e: unknown) => {
        if (!cancelled) setError(e instanceof Error ? e.message : "QR failed");
      });
    return () => {
      cancelled = true;
    };
  }, [value, size]);

  if (error) {
    return (
      <p className="text-xs leading-snug text-red-700" role="alert">
        {error}
      </p>
    );
  }

  if (!svg) {
    return (
      <div
        className="mx-auto flex items-center justify-center rounded-md bg-gray-100"
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  return (
    <div
      className="flex justify-center [&_svg]:h-auto [&_svg]:max-w-full"
      style={{ width: size, height: size }}
      /* SVG from QRCode.toString — trusted library output for display only */
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
}
