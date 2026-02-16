export class AnalyticsNotImplementedError extends Error {
  constructor(message = 'Analytics module is not implemented yet') {
    super(message);
    this.name = 'AnalyticsNotImplementedError';
  }
}
