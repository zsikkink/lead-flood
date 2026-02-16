export class MessagingNotImplementedError extends Error {
  constructor(message = 'Messaging module is not implemented yet') {
    super(message);
    this.name = 'MessagingNotImplementedError';
  }
}
