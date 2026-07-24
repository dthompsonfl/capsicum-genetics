'use client';

import type { ComponentProps, FormEvent } from 'react';
import { useEffect, useMemo, useState } from 'react';

interface MutationFormProps extends ComponentProps<'form'> {
  intent: string;
  completedRequestId?: string;
}

interface StoredIntent {
  id: string;
  payload: string;
}

const PREFIX = 'capsicum:mutation:';

function bytesToHex(bytes: ArrayBuffer): string {
  return [...new Uint8Array(bytes)].map((value) => value.toString(16).padStart(2, '0')).join('');
}

async function stablePayload(form: HTMLFormElement): Promise<string> {
  const entries: Array<readonly [string, string]> = [];
  for (const [key, value] of new FormData(form).entries()) {
    if (key === 'clientRequestId') continue;
    if (typeof value === 'string') {
      entries.push([key, value]);
      continue;
    }
    const digest = await crypto.subtle.digest('SHA-256', await value.arrayBuffer());
    entries.push([
      key,
      JSON.stringify({
        name: value.name,
        size: value.size,
        type: value.type,
        lastModified: value.lastModified,
        sha256: bytesToHex(digest),
      }),
    ]);
  }
  entries.sort(([leftKey, leftValue], [rightKey, rightValue]) => {
    const byKey = leftKey < rightKey ? -1 : leftKey > rightKey ? 1 : 0;
    if (byKey !== 0) return byKey;
    return leftValue < rightValue ? -1 : leftValue > rightValue ? 1 : 0;
  });
  return JSON.stringify(entries);
}

function readStored(key: string): StoredIntent | null {
  try {
    const raw = window.sessionStorage.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredIntent>;
    return typeof parsed.id === 'string' && typeof parsed.payload === 'string'
      ? { id: parsed.id, payload: parsed.payload }
      : null;
  } catch {
    return null;
  }
}

export function MutationForm({ intent, completedRequestId, onSubmitCapture, children, ...props }: MutationFormProps) {
  const storageKey = useMemo(() => `${PREFIX}${intent}`, [intent]);
  const [preparationError, setPreparationError] = useState<string | null>(null);

  useEffect(() => {
    if (!completedRequestId) return;
    const stored = readStored(storageKey);
    if (stored?.id === completedRequestId) window.sessionStorage.removeItem(storageKey);
  }, [completedRequestId, storageKey]);

  async function prepare(event: FormEvent<HTMLFormElement>) {
    const form = event.currentTarget;
    if (form.dataset.mutationPrepared === 'true') {
      delete form.dataset.mutationPrepared;
      delete form.dataset.mutationPreparing;
      onSubmitCapture?.(event);
      return;
    }

    event.preventDefault();
    if (form.dataset.mutationPreparing === 'true') return;
    form.dataset.mutationPreparing = 'true';
    setPreparationError(null);

    const submitter = event.nativeEvent instanceof SubmitEvent ? event.nativeEvent.submitter : null;
    try {
      const payload = await stablePayload(form);
      const stored = readStored(storageKey);
      const requestId = stored?.payload === payload ? stored.id : crypto.randomUUID();
      window.sessionStorage.setItem(storageKey, JSON.stringify({ id: requestId, payload } satisfies StoredIntent));
      const field = form.elements.namedItem('clientRequestId');
      if (!(field instanceof HTMLInputElement)) {
        throw new Error('Mutation form is missing its client request identifier field.');
      }
      field.value = requestId;
      form.dataset.mutationPrepared = 'true';
      form.requestSubmit(
        submitter instanceof HTMLButtonElement || submitter instanceof HTMLInputElement
          ? submitter
          : undefined,
      );
    } catch {
      delete form.dataset.mutationPrepared;
      delete form.dataset.mutationPreparing;
      setPreparationError('The request could not be prepared safely. Review the selected files and try again.');
    }
  }

  return (
    <form {...props} data-mutation-intent={intent} onSubmitCapture={prepare}>
      <input type="hidden" name="clientRequestId" defaultValue="" />
      {children}
      {preparationError ? <p className="error" role="alert">{preparationError}</p> : null}
    </form>
  );
}

export function MutationCompletionListener() {
  useEffect(() => {
    const current = new URL(window.location.href);
    const completedRequestId = current.searchParams.get('completedRequestId');
    if (!completedRequestId) return;
    for (let index = window.sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = window.sessionStorage.key(index);
      if (!key?.startsWith(PREFIX)) continue;
      const stored = readStored(key);
      if (stored?.id === completedRequestId) window.sessionStorage.removeItem(key);
    }
    current.searchParams.delete('completedRequestId');
    window.history.replaceState(window.history.state, '', `${current.pathname}${current.search}${current.hash}`);
  }, []);

  return null;
}
