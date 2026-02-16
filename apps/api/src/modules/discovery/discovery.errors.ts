export class DiscoveryNotImplementedError extends Error {
  constructor(message = 'Discovery module is not implemented yet') {
    super(message);
    this.name = 'DiscoveryNotImplementedError';
  }
}

export class DiscoveryRunNotFoundError extends Error {
  constructor(message = 'Discovery run not found') {
    super(message);
    this.name = 'DiscoveryRunNotFoundError';
  }
}
