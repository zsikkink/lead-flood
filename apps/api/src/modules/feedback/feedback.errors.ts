export class FeedbackNotImplementedError extends Error {
  constructor(message = 'Feedback module is not implemented yet') {
    super(message);
    this.name = 'FeedbackNotImplementedError';
  }
}
