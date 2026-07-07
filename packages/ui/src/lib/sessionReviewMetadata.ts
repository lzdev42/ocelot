import type { Session } from '@opencode-ai/sdk/v2';

export type SessionMetadataRecord = Record<string, unknown>;

type OcelotMetadata = {
  kind?: 'review';
  originalSessionID?: string;
  reviewSessionID?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  Boolean(value && typeof value === 'object' && !Array.isArray(value));

export const getSessionMetadata = (session: Session | null | undefined): SessionMetadataRecord => {
  const metadata = (session as (Session & { metadata?: unknown }) | null | undefined)?.metadata;
  return isRecord(metadata) ? metadata : {};
};

const getOcelotMetadata = (metadata: SessionMetadataRecord): OcelotMetadata => {
  const value = metadata.openchamber;
  return isRecord(value) ? value as OcelotMetadata : {};
};

export const getReviewSessionID = (session: Session | null | undefined): string | null => {
  const value = getOcelotMetadata(getSessionMetadata(session)).reviewSessionID;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

export const getOriginalSessionID = (session: Session | null | undefined): string | null => {
  const value = getOcelotMetadata(getSessionMetadata(session)).originalSessionID;
  return typeof value === 'string' && value.trim().length > 0 ? value : null;
};

export const isReviewSession = (session: Session | null | undefined): boolean =>
  getOcelotMetadata(getSessionMetadata(session)).kind === 'review' && Boolean(getOriginalSessionID(session));

export const withReviewSessionLink = (
  metadata: SessionMetadataRecord,
  reviewSessionID: string,
): SessionMetadataRecord => {
  const current = getOcelotMetadata(metadata);
  return {
    ...metadata,
    openchamber: {
      ...current,
      reviewSessionID,
    },
  };
};

export const withReviewSessionMarker = (
  metadata: SessionMetadataRecord,
  originalSessionID: string,
): SessionMetadataRecord => {
  const current = getOcelotMetadata(metadata);
  return {
    ...metadata,
    openchamber: {
      ...current,
      kind: 'review' as const,
      originalSessionID,
    },
  };
};

export const withoutReviewSessionLink = (
  metadata: SessionMetadataRecord,
  reviewSessionID: string,
): SessionMetadataRecord => {
  const current = getOcelotMetadata(metadata);
  if (current.reviewSessionID !== reviewSessionID) return metadata;

  const restOcelot = { ...current };
  delete restOcelot.reviewSessionID;
  const next: SessionMetadataRecord = { ...metadata };
  if (Object.keys(restOcelot).length > 0) {
    next.openchamber = restOcelot;
  } else {
    delete next.openchamber;
  }
  return next;
};
