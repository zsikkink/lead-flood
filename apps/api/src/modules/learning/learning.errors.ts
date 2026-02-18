export class LearningNotImplementedError extends Error {
  constructor(message = 'Learning module is not implemented yet') {
    super(message);
    this.name = 'LearningNotImplementedError';
  }
}

export class LearningNotFoundError extends Error {
  constructor(message = 'Learning resource not found') {
    super(message);
    this.name = 'LearningNotFoundError';
  }
}
