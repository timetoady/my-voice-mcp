import type {
  ProviderCritiqueRequest,
  ProviderCritiqueResponse,
  ProviderEmailBundleDistillationRequest,
  ProviderEmailBundleDistillationResponse,
  ProviderGenerateRequest,
  ProviderGenerateResponse,
  ProviderRevisionRequest,
  ProviderRevisionResponse,
  ProviderRewriteRequest,
  ProviderRewriteResponse
} from "../domain/types.js";

export interface ModelProvider {
  readonly kind: string;
  distillEmailBundle(
    request: ProviderEmailBundleDistillationRequest
  ): Promise<ProviderEmailBundleDistillationResponse>;
  rewrite(request: ProviderRewriteRequest): Promise<ProviderRewriteResponse>;
  generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse>;
  critique(request: ProviderCritiqueRequest): Promise<ProviderCritiqueResponse>;
  revise(request: ProviderRevisionRequest): Promise<ProviderRevisionResponse>;
}
