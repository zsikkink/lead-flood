export class ScoringNotImplementedError extends Error {
  constructor(message = 'Scoring module is not implemented yet') {
    super(message);
    this.name = 'ScoringNotImplementedError';
  }
}
