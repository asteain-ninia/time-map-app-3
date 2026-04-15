import { describe, expect, it, vi } from 'vitest';
import { Logger, PersistentLogSink } from '@infrastructure/Logger';

describe('Logger', () => {
  it('閾値未満のログを破棄し、閾値以上だけを出力する', () => {
    const sink = { write: vi.fn() };
    const logger = new Logger({ minLevel: 'warn', sinks: [sink] });

    logger.info('skip');
    logger.error('keep', { code: 500 });

    expect(sink.write).toHaveBeenCalledTimes(1);
    expect(sink.write).toHaveBeenCalledWith(expect.objectContaining({
      level: 'error',
      message: 'keep',
      context: [],
      data: { code: 500 },
    }));
  });

  it('子ロガーはコンテキストとログレベル設定を共有する', () => {
    const sink = { write: vi.fn() };
    const rootLogger = new Logger({
      context: ['Renderer'],
      minLevel: 'error',
      sinks: [sink],
    });
    const childLogger = rootLogger.child('App');

    childLogger.warn('hidden');
    rootLogger.setMinLevel('debug');
    childLogger.debug('visible');

    expect(sink.write).toHaveBeenCalledTimes(1);
    expect(sink.write).toHaveBeenCalledWith(expect.objectContaining({
      level: 'debug',
      message: 'visible',
      context: ['Renderer', 'App'],
    }));
  });

  it('measure が成功時は実行時間を debug ログへ残す', async () => {
    const sink = { write: vi.fn() };
    const logger = new Logger({ minLevel: 'debug', sinks: [sink] });

    await expect(
      logger.measure('save project', async () => 'ok', { filePath: 'world.json' })
    ).resolves.toBe('ok');

    expect(sink.write).toHaveBeenCalledWith(expect.objectContaining({
      level: 'debug',
      message: 'save project',
      data: expect.objectContaining({
        durationMs: expect.any(Number),
        data: { filePath: 'world.json' },
      }),
    }));
  });

  it('measure が失敗時は error ログへ例外を残して再throwする', async () => {
    const sink = { write: vi.fn() };
    const logger = new Logger({ minLevel: 'debug', sinks: [sink] });

    await expect(
      logger.measure('load project', async () => {
        throw new Error('boom');
      }, { filePath: 'broken.json' })
    ).rejects.toThrow('boom');

    expect(sink.write).toHaveBeenCalledWith(expect.objectContaining({
      level: 'error',
      message: 'load project failed',
      data: expect.objectContaining({
        durationMs: expect.any(Number),
        data: { filePath: 'broken.json' },
        error: expect.objectContaining({
          name: 'Error',
          message: 'boom',
        }),
      }),
    }));
  });
});

describe('PersistentLogSink', () => {
  it('ログ出力を 1 行ずつファイルへ追記する', async () => {
    const port = {
      appendFile: vi.fn().mockResolvedValue(undefined),
      getLogRootPath: vi.fn().mockResolvedValue('/mock/logs'),
    };
    const sink = new PersistentLogSink(port);
    const entry = {
      timestamp: '2026-04-09T00:00:00.000Z',
      level: 'info' as const,
      message: 'saved',
      context: ['Renderer', 'App'],
      data: { filePath: 'world.json' },
    };

    sink.write(entry);
    await new Promise((resolve) => setTimeout(resolve, 0));

    expect(port.getLogRootPath).toHaveBeenCalledTimes(1);
    expect(port.appendFile).toHaveBeenCalledWith(
      '/mock/logs/gimoza.log',
      `${JSON.stringify(entry)}\n`
    );
  });
});
