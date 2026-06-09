export interface Logger {
  info(event: string, details?: Record<string, unknown>): void;
  warn(event: string, details?: Record<string, unknown>): void;
  error(event: string, details?: Record<string, unknown>): void;
}

function write(level: string, event: string, details?: Record<string, unknown>) {
  const payload = {
    timestamp: new Date().toISOString(),
    level,
    event,
    ...details
  };

  const line = JSON.stringify(payload);
  if (level === "error") {
    console.error(line);
    return;
  }

  console.log(line);
}

export const logger: Logger = {
  info(event, details) {
    write("info", event, details);
  },
  warn(event, details) {
    write("warn", event, details);
  },
  error(event, details) {
    write("error", event, details);
  }
};
