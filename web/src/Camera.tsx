import { useEffect, useRef, useState } from 'react';
import { locate, type CaptureLocation } from './listings';

export interface Capture { photo: Blob; capturedAt: number; location: CaptureLocation }

/** Live camera only. No gallery imports or EXIF claims about when a file was made. */
export default function Camera({ onCapture }: { onCapture: (capture: Capture | null) => void }) {
  const video = useRef<HTMLVideoElement>(null), stream = useRef<MediaStream | null>(null);
  const mounted = useRef(true);
  const [open, setOpen] = useState(false), [ready, setReady] = useState(false), [busy, setBusy] = useState(false), [error, setError] = useState('');
  function stop() { stream.current?.getTracks().forEach((track) => track.stop()); stream.current = null; }
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; stop(); }; }, []);
  useEffect(() => { if (open && video.current && stream.current) video.current.srcObject = stream.current; }, [open]);
  async function start() {
    onCapture(null); setError(''); setBusy(true); setReady(false);
    try {
      stop();
      const media = await navigator.mediaDevices.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 } }, audio: false });
      if (!mounted.current) { media.getTracks().forEach((track) => track.stop()); return; }
      stream.current = media; setOpen(true);
    } catch { setError('Allow camera access to take a fresh photo here.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  async function capture() {
    const source = video.current;
    if (!source || !source.videoWidth || busy) return;
    setBusy(true); setError('');
    try {
      // Acquire a fresh location fix, then take the frame. Upload time is recorded separately.
      const location = await locate();
      if (!mounted.current || !stream.current?.active) return;
      const canvas = document.createElement('canvas');
      const scale = Math.min(1, 640 / Math.max(source.videoWidth, source.videoHeight));
      canvas.width = Math.round(source.videoWidth * scale); canvas.height = Math.round(source.videoHeight * scale);
      const context = canvas.getContext('2d');
      if (!context) throw new Error('Camera capture is unavailable.');
      context.drawImage(source, 0, 0, canvas.width, canvas.height);
      const capturedAt = Date.now();
      const photo = await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('Could not capture photo.')), 'image/jpeg', 0.65));
      if (!mounted.current) return;
      onCapture({ photo, capturedAt, location });
      stop(); setOpen(false);
    } catch (e) { setError(e instanceof Error ? e.message : 'Could not record this spot.'); }
    finally { if (mounted.current) setBusy(false); }
  }
  return <div className="sighting-camera">
    {open ? <><video ref={video} autoPlay playsInline muted onLoadedData={() => setReady(true)} aria-label="Live camera preview" /><button type="button" className="wood-primary" disabled={!ready || busy} onClick={capture}>{busy ? 'Recording a fresh GPS location…' : 'Take photo here'}</button><button type="button" disabled={busy} onClick={() => { stop(); setOpen(false); }}>Cancel camera</button></> : <button type="button" className="sighting-camera-start" disabled={busy} onClick={start}><span aria-hidden="true">📷</span><strong>{busy ? 'Opening camera…' : 'Take a photo'}</strong><small>Time and location are recorded when you take it.</small></button>}
    {error && <p className="wood-error" role="alert">{error}</p>}
  </div>;
}
