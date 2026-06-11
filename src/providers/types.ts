import type {
  ProviderBundleDistillationRequest,
  ProviderBundleDistillationResponse,
  ProviderCritiqueRequest,
  ProviderCritiqueResponse,
  ProviderGenerateRequest,
  ProviderGenerateResponse,
  ProviderRevisionRequest,
  ProviderRevisionResponse,
  ProviderRewriteRequest,
  ProviderRewriteResponse
} from "../domain/types.js";

export interface ModelProvider {
  readonly kind: string;
  distillBundle(
    request: ProviderBundleDistillationRequest
  ): Promise<ProviderBundleDistillationResponse>;
  rewrite(request: ProviderRewriteRequest): Promise<ProviderRewriteResponse>;
  generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse>;
  critique(request: ProviderCritiqueRequest): Promise<ProviderCritiqueResponse>;
  revise(request: ProviderRevisionRequest): Promise<ProviderRevisionResponse>;
}
