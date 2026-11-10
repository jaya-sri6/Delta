import { describe, it, expect } from 'vitest';
import { TemporalResolver, FixedClock } from '../../src/server/services/temporal-resolver.js';

describe('TemporalResolver', () => {
  // Reference date: Tuesday, November 10, 2026, 12:00:00 UTC
  const fixedNow = new Date('2026-11-10T12:00:00.000Z');
  const clock = new FixedClock(fixedNow);
  const resolver = new TemporalResolver(clock, 'Asia/Kolkata');

  it('resolves "today"', () => {
    const res = resolver.resolve('today');
    expect(res.resolution_method).toBe('DAY_RELATIVE');
    expect(res.resolved_start).toBeDefined();
    const start = new Date(res.resolved_start!);
    expect(start.getDate()).toBe(10);
    expect(start.getMonth()).toBe(10); // November
    expect(start.getFullYear()).toBe(2026);
  });

  it('resolves "yesterday"', () => {
    const res = resolver.resolve('yesterday');
    expect(res.resolution_method).toBe('DAY_RELATIVE');
    const start = new Date(res.resolved_start!);
    expect(start.getDate()).toBe(9);
  });

  it('resolves "tomorrow"', () => {
    const res = resolver.resolve('tomorrow');
    const start = new Date(res.resolved_start!);
    expect(start.getDate()).toBe(11);
  });

  it('resolves "last Tuesday" (exactly 7 days prior when today is Tuesday)', () => {
    const res = resolver.resolve('last Tuesday');
    expect(res.resolution_method).toBe('WEEKDAY_RELATIVE');
    const start = new Date(res.resolved_start!);
    expect(start.getDate()).toBe(3); // 10 - 7 = 3
    expect(start.getMonth()).toBe(10); // Nov
  });

  it('resolves "on Monday"', () => {
    // Current is Tuesday 10 Nov -> Monday is 9 Nov
    const res = resolver.resolve('on Monday');
    expect(res.resolution_method).toBe('WEEKDAY_RELATIVE');
    const start = new Date(res.resolved_start!);
    expect(start.getDate()).toBe(9);
  });

  it('resolves explicit date "3 November"', () => {
    const res = resolver.resolve('3 November');
    expect(res.resolution_method).toBe('EXPLICIT_DATE');
    const start = new Date(res.resolved_start!);
    expect(start.getDate()).toBe(3);
    expect(start.getMonth()).toBe(10); // Nov (0-indexed 10 is November)
    expect(start.getFullYear()).toBe(2026);
  });

  it('resolves explicit date "November 3"', () => {
    const res = resolver.resolve('November 3');
    expect(res.resolution_method).toBe('EXPLICIT_DATE');
    const start = new Date(res.resolved_start!);
    expect(start.getDate()).toBe(3);
  });

  it('resolves "last week"', () => {
    const res = resolver.resolve('last week');
    expect(res.resolution_method).toBe('WEEK_RELATIVE');
    expect(res.resolved_start).toBeDefined();
    expect(res.resolved_end).toBeDefined();
  });

  it('extracts temporal expressions from user prompt', () => {
    const expressions = resolver.extractTemporalExpressions('On Monday we shortlisted 5 CRM tools. Has anything changed since then?');
    expect(expressions).toContain('On Monday');
    expect(expressions).toContain('since then');
  });
});

