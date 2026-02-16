export class EnrichmentNotImplementedError extends Error {
  constructor(message = 'Enrichment module is not implemented yet') {
    super(message);
    this.name = 'EnrichmentNotImplementedError';
  }
}
