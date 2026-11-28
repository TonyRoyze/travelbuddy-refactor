import type { VerificationConfig } from "../config";
import { AzureFaceClient } from "./azure-face";
import type { IdentityVerificationProvider } from "./interface";
import {
  signSessionReference,
  verifySessionReference,
} from "./session-reference";
import { VisionAiClient } from "./vision-ai";

export function createVerificationProvider(
  config: VerificationConfig,
): IdentityVerificationProvider {
  const azureConfig =
    config.providerMode === "option_a_inhouse" ? config.azureFace : undefined;
  const azure = azureConfig && new AzureFaceClient(azureConfig);
  const vision = config.visionAi && new VisionAiClient(config.visionAi);
  return {
    mode: config.providerMode,
    livenessConfigured: !!azure,
    visionConfigured: !!vision,
    async createLivenessSession(accountId) {
      if (!azure || !azureConfig) return null;
      const session = await azure.createLivenessSession(accountId);
      return {
        ...session,
        sessionId: signSessionReference(
          session.sessionId,
          accountId,
          azureConfig.key,
        ),
      };
    },
    async getLivenessResult(reference, accountId, submittedAt, signal) {
      if (!azure || !azureConfig) return { status: "unavailable" };
      const sessionId = verifySessionReference(
        reference,
        accountId,
        submittedAt,
        azureConfig.key,
      );
      return sessionId
        ? azure.getLivenessResult(sessionId, signal)
        : { status: "unavailable" };
    },
    getLivenessImage: async (imageId, signal) =>
      azure?.getLivenessImage(imageId, signal) ?? null,
    verifyFace: async (selfie, target, signal) =>
      azure?.verifyFace(selfie, target, signal) ?? null,
    extractDocument: async (slot, jpeg, signal, passport) =>
      vision?.extractDocument(slot, jpeg, signal, passport) ?? null,
    async deleteLivenessSession(reference, accountId, submittedAt) {
      if (!azure || !azureConfig) return;
      const sessionId = verifySessionReference(
        reference,
        accountId,
        submittedAt,
        azureConfig.key,
      );
      if (sessionId) await azure.deleteLivenessSession(sessionId);
    },
  };
}
