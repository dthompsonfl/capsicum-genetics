'use client';

import { useMemo, useState } from 'react';
import { createPhenotypeCaptureAction } from '@/app/actions';
import { MutationForm } from '@/components/mutation-form';
import { LocalDateTimeInput } from '@/components/local-date-time-input';

export type PhenotypeMediaOption = {
  id: string;
  fileName: string;
  materialId: string;
  materialCode: string;
};

export type PhenotypeProtocolOption = {
  id: string;
  label: string;
  requiredViews: readonly string[];
  requiresScaleReference: boolean;
  requiresColorReference: boolean;
};

function humanize(value: string): string {
  return value.replaceAll('_', ' ').replaceAll('-', ' ').replace(/\b\w/g, (character) => character.toUpperCase());
}

export function PhenotypeCaptureForm({ media, protocols }: {
  media: readonly PhenotypeMediaOption[];
  protocols: readonly PhenotypeProtocolOption[];
}) {
  const [mediaId, setMediaId] = useState(media[0]?.id ?? '');
  const [protocolId, setProtocolId] = useState(protocols[0]?.id ?? '');
  const selectedMedia = useMemo(() => media.find((item) => item.id === mediaId) ?? media[0], [media, mediaId]);
  const selectedProtocol = useMemo(() => protocols.find((item) => item.id === protocolId) ?? protocols[0], [protocolId, protocols]);
  const views = selectedProtocol?.requiredViews ?? [];

  if (!selectedMedia || !selectedProtocol) return null;

  return (
    <MutationForm intent="phenotype.capture" action={createPhenotypeCaptureAction} className="form-grid">
      <label className="field full">
        <span>Source image and plant material</span>
        <select name="mediaObjectId" value={selectedMedia.id} onChange={(event) => setMediaId(event.target.value)} required>
          {media.map((item) => <option key={item.id} value={item.id}>{item.fileName} · {item.materialCode}</option>)}
        </select>
        <small>The material is linked automatically from the inspected image, so the wrong plant cannot be selected by mistake.</small>
      </label>
      <input type="hidden" name="materialId" value={selectedMedia.materialId} />
      <label className="field">
        <span>Approved measurement protocol</span>
        <select name="protocolId" value={selectedProtocol.id} onChange={(event) => setProtocolId(event.target.value)} required>
          {protocols.map((protocol) => <option key={protocol.id} value={protocol.id}>{protocol.label}</option>)}
        </select>
        <small>The protocol defines minimum image quality and the views that are scientifically comparable.</small>
      </label>
      <label className="field">
        <span>Image view</span>
        <select name="viewName" defaultValue={views[0] ?? ''} key={selectedProtocol.id} required>
          {views.map((view) => <option key={view} value={view}>{humanize(view)}</option>)}
        </select>
        <small>Only views approved for the selected protocol are available.</small>
      </label>
      <label className="field">
        <span>Captured at</span>
        <LocalDateTimeInput id="capturedAt" name="capturedAt" />
      </label>
      <div className="field">
        <span className="field-label">Visible references</span>
        <label className="checkbox"><input name="operatorScaleConfirmed" type="checkbox" required={selectedProtocol.requiresScaleReference} /> Calibrated scale reference visible{selectedProtocol.requiresScaleReference ? ' (required)' : ''}</label>
        <label className="checkbox"><input name="operatorColorReferenceConfirmed" type="checkbox" required={selectedProtocol.requiresColorReference} /> Color reference visible{selectedProtocol.requiresColorReference ? ' (required)' : ''}</label>
      </div>
      <div className="help full">
        <strong>Before submitting</strong>
        <p>Use a sharp, well-lit image. Keep the subject fully visible, avoid perspective distortion, and include every reference required by the protocol. A rejected quality check remains in the audit history so the record is honest.</p>
      </div>
      <div className="full"><button className="button" type="submit">Evaluate image and create capture</button></div>
    </MutationForm>
  );
}
