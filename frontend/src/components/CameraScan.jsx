import { useEffect, useRef, useState } from "react";
import { Html5Qrcode } from "html5-qrcode";
import { Camera, CameraOff } from "lucide-react";
import { Button } from "./ui";

const TICKET_RE = /PKN-[A-Z0-9]+/i;

function extractTicket(raw) {
  const text = String(raw || "").trim().toUpperCase();
  const match = text.match(TICKET_RE);
  return match ? match[0] : text;
}

/** Live camera QR reader for the operator gate. Falls back to typed codes. */
export default function CameraScan({ onScan }) {
  const hostId = useRef(`qr-${Math.random().toString(36).slice(2)}`).current;
  const scannerRef = useRef(null);
  const onScanRef = useRef(onScan);
  onScanRef.current = onScan;
  const [active, setActive] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!active) return undefined;

    let cancelled = false;
    const scanner = new Html5Qrcode(hostId);
    scannerRef.current = scanner;

    scanner
      .start(
        { facingMode: "environment" },
        { fps: 10, qrbox: { width: 220, height: 220 } },
        (decoded) => {
          const code = extractTicket(decoded);
          if (code) onScanRef.current(code);
        },
      )
      .catch((err) => {
        if (cancelled) return;
        setError(err?.message || "Camera could not start. Type the code instead.");
        setActive(false);
      });

    return () => {
      cancelled = true;
      scanner.stop().catch(() => {}).finally(() => scanner.clear());
      scannerRef.current = null;
    };
  }, [active, hostId]);

  return (
    <div className="mt-3 space-y-2">
      <div id={hostId} className={active ? "overflow-hidden rounded-xl" : "hidden"} />
      {error && <p className="text-xs text-red-600">{error}</p>}
      {active ? (
        <Button type="button" variant="ghost" className="w-full" onClick={() => setActive(false)}>
          <CameraOff className="h-4 w-4" />
          Stop camera
        </Button>
      ) : (
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => {
            setError("");
            setActive(true);
          }}
        >
          <Camera className="h-4 w-4" />
          Scan QR with camera
        </Button>
      )}
    </div>
  );
}
