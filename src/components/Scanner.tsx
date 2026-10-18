import { useEffect, useRef, useState } from 'react'
import wasmUrl from 'zxing-wasm/reader/zxing_reader.wasm?url'

const FORMATS = ['ean_13', 'ean_8', 'upc_a', 'upc_e'] as const

interface Detector {
  detect(source: HTMLVideoElement): Promise<{ rawValue: string }[]>
}

declare global {
  interface Window {
    BarcodeDetector?: {
      new (opts: { formats: readonly string[] }): Detector
      getSupportedFormats(): Promise<string[]>
    }
  }
}

/** Native detector (Android Chrome) when it handles grocery barcodes; ZXing-WASM otherwise (iPhone). */
async function createDetector(): Promise<Detector> {
  const Native = window.BarcodeDetector
  if (Native) {
    try {
      const supported = await Native.getSupportedFormats()
      if (FORMATS.every((f) => supported.includes(f))) return new Native({ formats: FORMATS })
    } catch {
      // fall through to the polyfill
    }
  }
  const { BarcodeDetector, prepareZXingModule } = await import('barcode-detector/ponyfill')
  // Serve the decoder from our own origin so scanning works offline.
  prepareZXingModule({
    overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasmUrl : prefix + path) },
  })
  return new BarcodeDetector({ formats: [...FORMATS] })
}

/** A code must be out of view this long before the same code counts again. */
const REARM_MS = 900
const SCAN_INTERVAL_MS = 150

export function Scanner({ paused, onDetect }: { paused: boolean; onDetect: (code: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [flash, setFlash] = useState(false)
  const pausedRef = useRef(paused)
  const onDetectRef = useRef(onDetect)
  pausedRef.current = paused
  onDetectRef.current = onDetect

  useEffect(() => {
    let stopped = false
    let stream: MediaStream | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    const last = { code: '', seenAt: 0 }

    const start = async () => {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError('This browser can’t use the camera. Type the barcode below instead.')
        return
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } },
          audio: false,
        })
      } catch (err) {
        const denied = err instanceof DOMException && err.name === 'NotAllowedError'
        setError(
          denied
            ? 'Camera permission was denied. Allow camera access for this site in your browser settings, then reopen Scan.'
            : 'Couldn’t start the camera. Type the barcode below instead.',
        )
        return
      }
      if (stopped) {
        stream.getTracks().forEach((t) => t.stop())
        return
      }
      const video = videoRef.current!
      video.srcObject = stream
      await video.play().catch(() => {})
      const detector = await createDetector()

      const tick = async () => {
        if (stopped) return
        // Keep detecting while paused (only firing is suppressed), so an item still in view
        // when a sheet closes isn't counted a second time.
        if (video.readyState >= 2) {
          try {
            const found = await detector.detect(video)
            const now = Date.now()
            const code = found[0]?.rawValue
            if (code) {
              const isRepeat = code === last.code && now - last.seenAt < REARM_MS
              last.code = code
              last.seenAt = now
              if (!isRepeat && !pausedRef.current) {
                navigator.vibrate?.(40)
                setFlash(true)
                setTimeout(() => setFlash(false), 250)
                onDetectRef.current(code)
              }
            }
          } catch {
            // A frame that fails to decode is normal; keep going.
          }
        }
        timer = setTimeout(tick, SCAN_INTERVAL_MS)
      }
      void tick()
    }

    void start()
    return () => {
      stopped = true
      clearTimeout(timer)
      stream?.getTracks().forEach((t) => t.stop())
    }
  }, [])

  return (
    <div className="relative aspect-[4/3] w-full overflow-hidden bg-black">
      <video ref={videoRef} playsInline muted autoPlay className="h-full w-full object-cover" />
      {!error && (
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div
            className={`h-28 w-4/5 rounded-2xl border-4 transition-colors ${
              flash ? 'border-brand-500 bg-brand-500/20' : 'border-white/80'
            }`}
          />
        </div>
      )}
      {paused && !error && <div className="absolute inset-0 bg-black/50" />}
      {error && (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center text-sm text-white">{error}</div>
      )}
    </div>
  )
}
