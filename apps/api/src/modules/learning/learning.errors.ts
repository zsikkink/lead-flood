export class LearningNotImplementedError extends Error {
  constructor(message = 'Learning module is not implemented yet') {
    super(message);
    this.name = 'LearningNotImplementedError';
  }
}
