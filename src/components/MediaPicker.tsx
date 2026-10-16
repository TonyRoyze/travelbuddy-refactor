'use client';
import { useId, useState } from 'react';
import { Film, ImagePlus, Upload, X } from 'lucide-react';
import { MAX_CLIP_BYTES, MAX_CLIP_SECONDS, mediaUrl } from '@/lib/package-editor';

export function MediaPicker({ kind, ids, onChange, onBusyChange, disabled = false }: {
  kind: 'image' | 'video'; ids: string[]; onChange: (ids: string[]) => void; onBusyChange?: (busy: boolean) => void; disabled?: boolean;
}) {
  const id = useId(); const [busy, setBusy] = useState(false); const [progress, setProgress] = useState(0); const [error, setError] = useState('');
  const limit = kind === 'video' ? 3 : 6;
  async function upload(file: File) {
    setError('');
    if (file.size > MAX_CLIP_BYTES) { setError('Choose a file no larger than 25 MB.'); return; }
    setBusy(true); onBusyChange?.(true); setProgress(0);
    try {
      if (kind === 'video') {
        const duration = await new Promise<number>((resolve, reject) => {
          const video = document.createElement('video'); const url = URL.createObjectURL(file);
          const timer = window.setTimeout(() => { cleanup(); reject(new Error('This video could not be read. Try an MP4 or WebM file.')); }, 15000);
          const cleanup = () => { window.clearTimeout(timer); video.removeAttribute('src'); video.load(); URL.revokeObjectURL(url); };
          video.preload = 'metadata';
          video.onloadedmetadata = () => { const value = video.duration; cleanup(); resolve(value); };
          video.onerror = () => { cleanup(); reject(new Error('This video could not be read. Try an MP4 or WebM file.')); };
          video.src = url;
        });
        // WebM metadata can omit duration; the server verifies it in all cases.
        if (Number.isFinite(duration) && duration > MAX_CLIP_SECONDS) throw new Error('Trim this clip to 60 seconds or less.');
      }
      const media = await new Promise<{ id: string }>((resolve, reject) => {
        const form = new FormData(); form.set('file', file);
        const xhr = new XMLHttpRequest(); xhr.open('POST', '/api/media'); xhr.timeout = 120000;
        xhr.upload.onprogress = event => { if (event.lengthComputable) setProgress(Math.round(event.loaded / event.total * 100)); };
        xhr.onload = () => {
          try { const body = JSON.parse(xhr.responseText); if (xhr.status < 200 || xhr.status >= 300) throw new Error(body.error || 'Upload failed. Please try again.'); resolve(body.media); }
          catch (error) { reject(error instanceof Error ? error : new Error('Upload failed. Please try again.')); }
        };
        xhr.onerror = xhr.ontimeout = () => reject(new Error('The upload did not finish. Check your connection and try again.'));
        xhr.send(form);
      });
      onChange([...ids, media.id]);
    } catch (error) { setError(error instanceof Error ? error.message : 'Upload failed. Please try again.'); }
    finally { setBusy(false); onBusyChange?.(false); }
  }
  return <div className="media-picker">
    <div className={`media-grid media-grid-${kind}`}>{ids.map((mediaId, index) => <div className="media-tile" key={mediaId}>
      {kind === 'video' ? <video src={mediaUrl(mediaId)} controls playsInline preload="metadata" aria-label={`Video clip ${index + 1}`} /> : <img src={mediaUrl(mediaId)} alt={index === 0 ? 'Package cover' : `Package photo ${index + 1}`} />}
      <div className="media-tile-caption"><span>{kind === 'image' ? index === 0 ? 'Cover photo' : `Photo ${index + 1}` : `Clip ${index + 1}`}</span><button className="icon-button" type="button" disabled={disabled || busy} onClick={() => onChange(ids.filter(value => value !== mediaId))} aria-label={`Remove ${kind === 'video' ? 'clip' : 'photo'} ${index + 1}`}><X size={16} /></button></div>
    </div>)}</div>
    {ids.length < limit && <label className={`media-upload ${disabled || busy ? 'media-upload-disabled' : ''}`} htmlFor={id}>
      {kind === 'video' ? <Film size={26} /> : <ImagePlus size={26} />}<strong>{busy ? progress === 100 ? 'Checking your upload…' : `Uploading… ${progress}%` : kind === 'video' ? 'Add a short clip' : ids.length ? 'Add another photo' : 'Add a cover photo'}</strong>
      <span>{kind === 'video' ? 'MP4 or WebM · up to 60 seconds' : 'JPEG, PNG or WebP'} · up to 25 MB</span>
      {!busy && <span className="text-link"><Upload size={15} />Choose a file</span>}
      <input id={id} className="sr-only" type="file" accept={kind === 'video' ? 'video/mp4,video/webm' : 'image/jpeg,image/png,image/webp'} disabled={disabled || busy} onChange={event => { const file = event.target.files?.[0]; event.target.value = ''; if (file) void upload(file); }} aria-label={kind === 'video' ? 'Upload video clip' : 'Upload package photo'} />
      {busy && <progress value={progress} max="100" aria-label="Upload progress" />}
    </label>}
    <p className="field-help">{ids.length} of {limit} {kind === 'video' ? 'clips' : 'photos'}{kind === 'image' && ' · Your first photo is the cover.'}</p>
    {error && <p className="error-message" role="alert">{error}</p>}
  </div>;
}
