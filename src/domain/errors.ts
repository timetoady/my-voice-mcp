export class AppError extends Error {
  constructor(message: string, readonly code: string, readonly status = 400) {
    super(message);
    this.name = "AppError";
  }
}

export class UnsupportedSourceError extends AppError {
  constructor(message: string) {
    super(message, "UNSUPPORTED_SOURCE", 400);
  }
}

export class ProviderConfigurationError extends AppError {
  constructor(message: string) {
    super(message, "PROVIDER_CONFIGURATION_ERROR", 500);
  }
}

export class NotFoundError extends AppError {
  constructor(message: string) {
    super(message, "NOT_FOUND", 404);
  }
}
