export class DiscoveryAdminNotFoundError extends Error {
  constructor(message = 'Record not found') {
    super(message);
    this.name = 'DiscoveryAdminNotFoundError';
  }
}

export class DiscoveryAdminNotImplementedError extends Error {
  constructor(message = 'Discovery admin dependency is not configured') {
    super(message);
    this.name = 'DiscoveryAdminNotImplementedError';
  }
}
