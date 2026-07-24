'use client';

import { useMemo, useState, type FormEvent } from 'react';

interface Option { value: string; label: string }

function intentId(key: string, payload: string): string {
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? 'null') as { id?: unknown; payload?: unknown } | null;
    if (stored && typeof stored.id === 'string' && stored.payload === payload) return stored.id;
  } catch { /* replace corrupt browser state */ }
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ id, payload }));
  return id;
}

export function StreamingMediaUploadForm({ options }: { options: Option[] }) {
  const storageKey = 'capsicum:stream-upload:media';
  const [status, setStatus] = useState<string>('');
  const first = useMemo(() => options[0]?.value ?? '', [options]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const entityKey = String(data.get('entityKey') ?? first);
    const file = data.get('file');
    if (!(file instanceof File) || file.size < 1) { setStatus('Choose an image to upload.'); return; }
    const payload = JSON.stringify({ entityKey, name: file.name, size: file.size, type: file.type, lastModified: file.lastModified });
    const requestId = intentId(storageKey, payload);
    setStatus('Uploading to quarantine…');
    try {
      const response = await fetch('/api/media/upload', {
        method: 'POST', credentials: 'same-origin', redirect: 'follow', body: file,
        headers: {
          'content-type': file.type || 'application/octet-stream',
          'x-capsicum-upload-size': String(file.size),
          'x-capsicum-client-request-id': encodeURIComponent(requestId),
          'x-capsicum-entity-key': encodeURIComponent(entityKey),
          'x-capsicum-file-name': encodeURIComponent(file.name),
        },
      });
      if (!response.ok) throw new Error('Upload request was rejected.');
      sessionStorage.removeItem(storageKey);
      window.location.assign(response.url);
    } catch {
      setStatus('The upload could not be completed. Retry uses the same request identity.');
    }
  }

  return <form className="form-grid" onSubmit={submit}>
    <div className="field"><label htmlFor="entityKey">Attach to</label><select id="entityKey" name="entityKey" defaultValue={first} required>{options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></div>
    <div className="field"><label htmlFor="media-file">Image</label><input id="media-file" name="file" type="file" accept="image/jpeg,image/png,image/webp" required /><small>JPEG, PNG, or WebP; maximum 25 MB and 80 megapixels. SVG is rejected.</small></div>
    <div className="full"><button className="button" type="submit">Quarantine and inspect</button></div>
    <p className="muted full" role="status" aria-live="polite">{status}</p>
  </form>;
}
