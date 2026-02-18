import {
  HunterAdapter,
  type HunterAdapterConfig,
  type HunterEnrichmentRequest,
  type HunterEnrichmentResult,
} from './hunter.adapter.js';

export interface HunterEnrichmentAdapterConfig extends HunterAdapterConfig {
  enabled?: boolean;
}

export class HunterEnrichmentAdapter extends HunterAdapter {
  private readonly enabled: boolean;

  constructor(config: HunterEnrichmentAdapterConfig) {
    super(config);
    this.enabled = config.enabled ?? true;
  }

  override async enrichLead(request: HunterEnrichmentRequest): Promise<HunterEnrichmentResult> {
    if (!this.enabled) {
      return {
        status: 'terminal_error',
        failure: {
          classification: 'terminal',
          statusCode: null,
          message: 'Hunter enrichment adapter is disabled',
          raw: null,
        },
      };
    }

    // TODO(provider-hunter): Add fallback lookup strategy when both email and domain are absent.
    return super.enrichLead(request);
  }
}
