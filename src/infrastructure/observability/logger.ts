import pino, { type DestinationStream, type Logger, type LoggerOptions } from "pino";

const redactionPaths = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.headers['x-api-key']",
  "res.headers['set-cookie']"
];

export function createLogger(level: string, destination?: DestinationStream): Logger {
  const options: LoggerOptions = {
    level,
    redact: {
      paths: redactionPaths,
      censor: "[REDACTED]"
    }
  };
  return destination ? pino(options, destination) : pino(options);
}
