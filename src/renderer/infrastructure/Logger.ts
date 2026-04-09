export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LogEntry {
  readonly timestamp: string;
  readonly level: LogLevel;
  readonly message: string;
  readonly context: readonly string[];
  readonly data?: unknown;
}

export interface LogSink {
  write(entry: LogEntry): void | Promise<void>;
}

export interface PersistentLogPort {
  appendFile(filePath: string, data: string): Promise<void>;
  getLogRootPath(): Promise<string>;
}

interface LoggerState {
  minLevel: LogLevel;
}

interface LoggerOptions {
  readonly context?: readonly string[];
  readonly minLevel?: LogLevel;
  readonly sinks?: readonly LogSink[];
  readonly state?: LoggerState;
}

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 10,
  info: 20,
  warn: 30,
  error: 40,
};

function getTimestamp(): string {
  return new Date().toISOString();
}

function getNow(): number {
  if (typeof performance !== 'undefined' && typeof performance.now === 'function') {
    return performance.now();
  }
  return Date.now();
}

function roundDuration(durationMs: number): number {
  return Math.round(durationMs * 100) / 100;
}

function isPromiseLike<T>(value: T | Promise<T>): value is Promise<T> {
  return typeof value === 'object' &&
    value !== null &&
    'then' in value &&
    typeof (value as Promise<T>).then === 'function';
}

function serializeError(error: Error, seen: WeakSet<object>): Record<string, unknown> {
  const serialized: Record<string, unknown> = {
    name: error.name,
    message: error.message,
  };

  if (error.stack) {
    serialized.stack = error.stack;
  }

  if ('cause' in error && error.cause !== undefined) {
    serialized.cause = serializeValue(error.cause, seen);
  }

  return serialized;
}

function serializeValue(value: unknown, seen = new WeakSet<object>()): unknown {
  if (value instanceof Error) {
    return serializeError(value, seen);
  }

  if (
    value === null ||
    value === undefined ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  ) {
    return value;
  }

  if (typeof value === 'bigint') {
    return value.toString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeValue(item, seen));
  }

  if (typeof value === 'function') {
    return `[Function ${value.name || 'anonymous'}]`;
  }

  if (typeof value === 'object') {
    if (seen.has(value)) {
      return '[Circular]';
    }

    seen.add(value);
    const serialized: Record<string, unknown> = {};
    for (const [key, entryValue] of Object.entries(value as Record<string, unknown>)) {
      serialized[key] = serializeValue(entryValue, seen);
    }
    return serialized;
  }

  return String(value);
}

function joinFilePath(basePath: string, fileName: string): string {
  if (!basePath) {
    return fileName;
  }
  const separator = basePath.includes('\\') ? '\\' : '/';
  return `${basePath.replace(/[\\/]+$/, '')}${separator}${fileName}`;
}

export function isLogLevel(value: unknown): value is LogLevel {
  return value === 'debug' ||
    value === 'info' ||
    value === 'warn' ||
    value === 'error';
}

export function createConsoleLogSink(
  consoleLike: Pick<Console, 'debug' | 'info' | 'warn' | 'error'> = console
): LogSink {
  return {
    write(entry: LogEntry): void {
      const contextPrefix = entry.context.length > 0
        ? `[${entry.context.join(':')}] `
        : '';
      const line = `${contextPrefix}${entry.message}`;
      const method = entry.level === 'debug'
        ? 'debug'
        : entry.level === 'info'
          ? 'info'
          : entry.level === 'warn'
            ? 'warn'
            : 'error';

      if (entry.data === undefined) {
        consoleLike[method](line);
        return;
      }

      consoleLike[method](line, entry.data);
    },
  };
}

export class PersistentLogSink implements LogSink {
  private rootPathPromise: Promise<string> | null = null;
  private writeQueue: Promise<void> = Promise.resolve();

  constructor(
    private readonly port: PersistentLogPort,
    private readonly fileName: string = 'time-map-app.log'
  ) {}

  write(entry: LogEntry): void {
    this.writeQueue = this.writeQueue
      .then(async () => {
        const rootPath = await this.getRootPath();
        const filePath = joinFilePath(rootPath, this.fileName);
        await this.port.appendFile(filePath, `${JSON.stringify(entry)}\n`);
      })
      .catch(() => undefined);
  }

  private getRootPath(): Promise<string> {
    if (!this.rootPathPromise) {
      this.rootPathPromise = this.port.getLogRootPath();
    }
    return this.rootPathPromise;
  }
}

export class Logger {
  private readonly context: readonly string[];
  private readonly sinks: readonly LogSink[];
  private readonly state: LoggerState;

  constructor(options: LoggerOptions = {}) {
    this.context = options.context ?? [];
    this.sinks = options.sinks ?? [];
    this.state = options.state ?? { minLevel: options.minLevel ?? 'info' };
  }

  getMinLevel(): LogLevel {
    return this.state.minLevel;
  }

  setMinLevel(level: LogLevel): void {
    this.state.minLevel = level;
  }

  child(context: string): Logger {
    return new Logger({
      context: [...this.context, context],
      sinks: this.sinks,
      state: this.state,
    });
  }

  debug(message: string, data?: unknown): void {
    this.log('debug', message, data);
  }

  info(message: string, data?: unknown): void {
    this.log('info', message, data);
  }

  warn(message: string, data?: unknown): void {
    this.log('warn', message, data);
  }

  error(message: string, data?: unknown): void {
    this.log('error', message, data);
  }

  measure<T>(
    message: string,
    operation: () => T | Promise<T>,
    data?: unknown
  ): T | Promise<T> {
    const startedAt = getNow();

    try {
      const result = operation();
      if (isPromiseLike(result)) {
        return result
          .then((value) => {
            this.debug(message, {
              durationMs: roundDuration(getNow() - startedAt),
              data: serializeValue(data),
            });
            return value;
          })
          .catch((error) => {
            this.error(`${message} failed`, {
              durationMs: roundDuration(getNow() - startedAt),
              data: serializeValue(data),
              error,
            });
            throw error;
          });
      }

      this.debug(message, {
        durationMs: roundDuration(getNow() - startedAt),
        data: serializeValue(data),
      });
      return result;
    } catch (error) {
      this.error(`${message} failed`, {
        durationMs: roundDuration(getNow() - startedAt),
        data: serializeValue(data),
        error,
      });
      throw error;
    }
  }

  private log(level: LogLevel, message: string, data?: unknown): void {
    if (LOG_LEVEL_PRIORITY[level] < LOG_LEVEL_PRIORITY[this.state.minLevel]) {
      return;
    }

    const entry: LogEntry = {
      timestamp: getTimestamp(),
      level,
      message,
      context: this.context,
      data: data === undefined ? undefined : serializeValue(data),
    };

    for (const sink of this.sinks) {
      try {
        const result = sink.write(entry);
        if (isPromiseLike(result)) {
          void result.catch(() => undefined);
        }
      } catch {
        // ロギング自体はアプリ動作を阻害しない
      }
    }
  }
}
