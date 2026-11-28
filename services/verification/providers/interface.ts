import type { DocumentSlot, LivenessStatus, ProviderMode } from "../types";
import type { DocumentExtraction } from "./vision-ai";

export interface LivenessSession {
  sessionId: string;
  authToken: string;
  expiresInSeconds: number;
}

export interface LivenessResult {
  status: LivenessStatus;
  sessionImageId?: string;
}

/**
 * A hybrid adapter can source identity from a managed KYC session while reusing
 * document extraction for transport and the same rules engine. Register a real
 * hybrid adapter before enabling automatic decisions for that provider mode.
 */
export interface IdentityVerificationProvider {
  readonly mode: ProviderMode;
  readonly livenessConfigured: boolean;
  readonly visionConfigured: boolean;
  createLivenessSession(accountId: string): Promise<LivenessSession | null>;
  getLivenessResult(
    sessionId: string,
    accountId: string,
    submittedAt: string,
    signal?: AbortSignal,
  ): Promise<LivenessResult>;
  getLivenessImage(
    sessionImageId: string,
    signal?: AbortSignal,
  ): Promise<Buffer | null>;
  verifyFace(
    selfieJpeg: Buffer,
    targetJpeg: Buffer,
    signal?: AbortSignal,
  ): Promise<number | null>;
  extractDocument(
    slot: DocumentSlot,
    normalizedJpegBase64: string,
    signal?: AbortSignal,
    passport?: boolean,
  ): Promise<DocumentExtraction | null>;
  deleteLivenessSession(
    sessionId: string,
    accountId: string,
    submittedAt: string,
  ): Promise<void>;
}
