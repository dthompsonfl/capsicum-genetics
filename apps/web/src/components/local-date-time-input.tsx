'use client';

import { useState } from 'react';

function localDateTimeValue(date = new Date()): string {
  const offset = date.getTimezoneOffset() * 60_000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function LocalDateTimeInput({ id, name, required = true, value }: { id: string; name: string; required?: boolean; value?: string }) {
  const [initialValue] = useState(() => value ?? localDateTimeValue());
  return <input id={id} name={name} type="datetime-local" defaultValue={initialValue} required={required} />;
}
