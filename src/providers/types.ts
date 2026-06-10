import type {
  ProviderGenerateRequest,
  ProviderGenerateResponse,
  ProviderRewriteRequest,
  ProviderRewriteResponse
} from "../domain/types.js";

export interface ModelProvider {
  readonly kind: string;
  rewrite(request: ProviderRewriteRequest): Promise<ProviderRewriteResponse>;
  generate(request: ProviderGenerateRequest): Promise<ProviderGenerateResponse>;
}
