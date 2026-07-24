'use client';

import { useState, type FormEvent } from 'react';

function requestIdentity(payload: string): string {
  const key = 'capsicum:stream-upload:research';
  try {
    const stored = JSON.parse(sessionStorage.getItem(key) ?? 'null') as { id?: unknown; payload?: unknown } | null;
    if (stored && typeof stored.id === 'string' && stored.payload === payload) return stored.id;
  } catch { /* replace invalid state */ }
  const id = crypto.randomUUID();
  sessionStorage.setItem(key, JSON.stringify({ id, payload }));
  return id;
}

export function StreamingResearchUploadForm() {
  const storageKey = 'capsicum:stream-upload:research';
  const [status, setStatus] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const title = String(data.get('title') ?? '').trim();
    const sourceLocator = String(data.get('sourceLocator') ?? '').trim();
    const documentVersion = String(data.get('documentVersion') ?? '').trim();
    const file = data.get('file');
    if (!(file instanceof File) || !title || !sourceLocator || !documentVersion) { setStatus('Complete every source field and choose a file.'); return; }
    const payload = JSON.stringify({ title, sourceLocator, documentVersion, name: file.name, size: file.size, type: file.type, lastModified: file.lastModified });
    const requestId = requestIdentity(payload);
    setStatus('Uploading immutable source…');
    try {
      const response = await fetch('/api/research/upload', {
        method: 'POST', credentials: 'same-origin', redirect: 'follow', body: file,
        headers: {
          'content-type': file.type || 'text/plain',
          'x-capsicum-upload-size': String(file.size),
          'x-capsicum-client-request-id': encodeURIComponent(requestId),
          'x-capsicum-file-name': encodeURIComponent(file.name),
          'x-capsicum-title': encodeURIComponent(title),
          'x-capsicum-source-locator': encodeURIComponent(sourceLocator),
          'x-capsicum-document-version': encodeURIComponent(documentVersion),
        },
      });
      if (!response.ok) throw new Error('Upload request was rejected.');
      sessionStorage.removeItem(storageKey);
      window.location.assign(response.url);
    } catch {
      setStatus('The source upload could not be completed. Retry uses the same request identity.');
    }
  }
  return <form className="form-grid" onSubmit={submit}>
    <label>Title<input name="title" required maxLength={300} autoComplete="off" /></label>
    <label>Source locator<input name="sourceLocator" required maxLength={2000} placeholder="DOI, URL, repository accession, or physical citation" autoComplete="off" /></label>
    <label>Document version<input name="documentVersion" required maxLength={120} placeholder="Published version, revision, or date" autoComplete="off" /></label>
    <label>UTF-8 source file<input name="file" type="file" required accept="text/plain,text/markdown,.txt,.md" /></label>
    <button type="submit">Queue source ingestion</button>
    <p className="muted full" role="status" aria-live="polite">{status}</p>
  </form>;
}
