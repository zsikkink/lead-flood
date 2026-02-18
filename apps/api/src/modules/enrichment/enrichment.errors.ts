export class EnrichmentNotImplementedError extends Error {
  constructor(message = 'Enrichment module is not implemented yet') {
    super(message);
    this.name = 'EnrichmentNotImplementedError';
  }
}

export class EnrichmentRunNotFoundError extends Error {
  constructor(message = 'Enrichment run not found') {
    super(message);
    this.name = 'EnrichmentRunNotFoundError';
  }
}
