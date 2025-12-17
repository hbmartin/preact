export class ConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ConfigError";
  }
}

export class ValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ValidationError";
  }
}

export class ExternalServiceError extends Error {
  readonly status?: number;

  // biome-ignore lint/suspicious/noExplicitAny: allow unknown external errors
  constructor(message: string, options?: { status?: number; cause?: any }) {
    super(message);
    this.name = "ExternalServiceError";
    this.status = options?.status;
    if (options?.cause) {
      // Maintain stack trace where possible
      this.cause = options.cause;
    }
  }
}

export class RepositoryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "RepositoryError";
  }
}
