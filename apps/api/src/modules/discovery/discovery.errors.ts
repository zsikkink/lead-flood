export class DiscoveryNotImplementedError extends Error {
  constructor(message = 'Discovery module is not implemented yet') {
    super(message);
    this.name = 'DiscoveryNotImplementedError';
  }
}
