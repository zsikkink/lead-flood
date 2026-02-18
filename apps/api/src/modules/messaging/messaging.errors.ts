export class MessagingNotImplementedError extends Error {
  constructor(message = 'Messaging module is not implemented yet') {
    super(message);
    this.name = 'MessagingNotImplementedError';
  }
}

export class MessagingNotFoundError extends Error {
  constructor(message = 'Messaging record not found') {
    super(message);
    this.name = 'MessagingNotFoundError';
  }
}
