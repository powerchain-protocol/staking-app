export class IntegrationError extends Error {
  constructor(
    public integration: string,
    public code: string,
    message: string,
    public status = 502,
    public details?: unknown,
  ) { super(message); }
}
export class ValidationError extends Error {
  code = 'VALIDATION_ERROR';
  constructor(message: string, public details?: unknown) { super(message); }
}
