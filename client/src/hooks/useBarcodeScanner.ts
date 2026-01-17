import { useState, useEffect, useCallback, useRef } from "react";
import { Html5Qrcode } from "html5-qrcode";

export function useBarcodeScanner(
  enabled: boolean,
  containerId: string,
  onScan: (code: string) => void
) {
  const [scannerReady, setScannerReady] = useState(false);
  const [cameraError, setCameraError] = useState<string | null>(null);
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const scannerRunningRef = useRef(false);
  const lastScannedCodeRef = useRef<string | null>(null);
  const scanTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const handleScannedCode = useCallback(
    (code: string) => {
      // Prevent duplicate scans within 3 seconds
      if (code === lastScannedCodeRef.current) return;
      lastScannedCodeRef.current = code;

      onScan(code);

      // Reset the duplicate check after 3 seconds
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
      scanTimeoutRef.current = setTimeout(() => {
        lastScannedCodeRef.current = null;
      }, 3000);
    },
    [onScan]
  );

  useEffect(() => {
    const stopScanner = async () => {
      if (scannerRef.current && scannerRunningRef.current) {
        try {
          await scannerRef.current.stop();
        } catch {
          // Ignore errors when stopping
        }
        scannerRunningRef.current = false;
      }
      scannerRef.current = null;
      setScannerReady(false);
    };

    if (!enabled) {
      stopScanner();
      return;
    }

    const startScanner = async () => {
      try {
        const container = document.getElementById(containerId);
        if (!container) {
          // Retry if container not ready
          setTimeout(startScanner, 100);
          return;
        }

        await stopScanner();

        const scanner = new Html5Qrcode(containerId);
        scannerRef.current = scanner;

        await scanner.start(
          { facingMode: "environment" },
          {
            fps: 10,
            qrbox: { width: 250, height: 150 },
            aspectRatio: 1.333,
          },
          (decodedText) => {
            handleScannedCode(decodedText);
          },
          () => {
            // Ignore scan errors (no barcode in frame)
          }
        );

        scannerRunningRef.current = true;
        setScannerReady(true);
        setCameraError(null);
      } catch (err) {
        console.error("Camera error:", err);
        scannerRunningRef.current = false;
        const message = err instanceof Error ? err.message : "Camera access denied";
        setCameraError(
          message.includes("Permission")
            ? "Camera permission denied. Please allow camera access."
            : "Could not start camera. Try manual entry."
        );
        setScannerReady(false);
      }
    };

    startScanner();

    return () => {
      stopScanner();
      if (scanTimeoutRef.current) {
        clearTimeout(scanTimeoutRef.current);
      }
    };
  }, [enabled, containerId, handleScannedCode]);

  return {
    scannerReady,
    cameraError,
  };
}
