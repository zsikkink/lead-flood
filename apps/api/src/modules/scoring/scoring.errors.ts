export class ScoringNotImplementedError extends Error {
  constructor(message = 'Scoring module is not implemented yet') {
    super(message);
    this.name = 'ScoringNotImplementedError';
  }
}

export class ScoringRunNotFoundError extends Error {
  constructor(message = 'Scoring run not found') {
    super(message);
    this.name = 'ScoringRunNotFoundError';
  }
}
