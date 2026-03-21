import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EventBus } from '@application/EventBus';
import { TimePoint } from '@domain/value-objects';

describe('EventBus', () => {
  let bus: EventBus;

  beforeEach(() => {
    bus = new EventBus();
  });

  it('リスナーにイベントを配信する', () => {
    const listener = vi.fn();
    bus.on('cursor:moved', listener);

    bus.emit('cursor:moved', { lon: 10, lat: 20 });

    expect(listener).toHaveBeenCalledWith({ lon: 10, lat: 20 });
  });

  it('複数リスナーにイベントを配信する', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    bus.on('viewport:zoomChanged', listener1);
    bus.on('viewport:zoomChanged', listener2);

    bus.emit('viewport:zoomChanged', { zoom: 5 });

    expect(listener1).toHaveBeenCalledWith({ zoom: 5 });
    expect(listener2).toHaveBeenCalledWith({ zoom: 5 });
  });

  it('異なるイベントのリスナーには配信しない', () => {
    const cursorListener = vi.fn();
    const zoomListener = vi.fn();
    bus.on('cursor:moved', cursorListener);
    bus.on('viewport:zoomChanged', zoomListener);

    bus.emit('cursor:moved', { lon: 0, lat: 0 });

    expect(cursorListener).toHaveBeenCalledTimes(1);
    expect(zoomListener).not.toHaveBeenCalled();
  });

  it('on() が返す関数でリスナーを解除できる', () => {
    const listener = vi.fn();
    const unsub = bus.on('cursor:left', listener);

    unsub();
    bus.emit('cursor:left', {});

    expect(listener).not.toHaveBeenCalled();
  });

  it('offAll() で特定イベントの全リスナーを解除できる', () => {
    const listener1 = vi.fn();
    const listener2 = vi.fn();
    bus.on('cursor:moved', listener1);
    bus.on('cursor:moved', listener2);

    bus.offAll('cursor:moved');
    bus.emit('cursor:moved', { lon: 0, lat: 0 });

    expect(listener1).not.toHaveBeenCalled();
    expect(listener2).not.toHaveBeenCalled();
  });

  it('clear() で全イベントの全リスナーを解除できる', () => {
    const cursorListener = vi.fn();
    const zoomListener = vi.fn();
    bus.on('cursor:moved', cursorListener);
    bus.on('viewport:zoomChanged', zoomListener);

    bus.clear();
    bus.emit('cursor:moved', { lon: 0, lat: 0 });
    bus.emit('viewport:zoomChanged', { zoom: 1 });

    expect(cursorListener).not.toHaveBeenCalled();
    expect(zoomListener).not.toHaveBeenCalled();
  });

  it('リスナーがないイベントをemitしてもエラーにならない', () => {
    expect(() => {
      bus.emit('feature:added', { featureId: 'test' });
    }).not.toThrow();
  });

  it('time:changed イベントで TimePoint を配信できる', () => {
    const listener = vi.fn();
    bus.on('time:changed', listener);

    const time = new TimePoint(1500, 6, 15);
    bus.emit('time:changed', { time });

    expect(listener).toHaveBeenCalledWith({ time });
    expect(listener.mock.calls[0][0].time.year).toBe(1500);
  });
});
