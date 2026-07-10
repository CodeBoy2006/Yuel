import { describe, expect, it } from 'vitest';

import { BrandLockup } from './primitives';
import { renderForSmoke } from './renderTest';

describe('BrandLockup reading progress', () => {
  it('fills the shared logo from the bottom using the effective-word ratio', async () => {
    const container = await renderForSmoke(
      <BrandLockup progress={{ effectiveWords: 275, thresholdWords: 500 }} />,
    );
    const lockup = container.querySelector<HTMLElement>('.yuel-brand');
    const mark = container.querySelector<HTMLElement>('.yuel-brand__mark');

    expect(lockup?.getAttribute('role')).toBe('progressbar');
    expect(lockup?.getAttribute('aria-valuemin')).toBe('0');
    expect(lockup?.getAttribute('aria-valuemax')).toBe('500');
    expect(lockup?.getAttribute('aria-valuenow')).toBe('275');
    expect(lockup?.getAttribute('aria-valuetext')).toContain('今日阅读进度 55%');
    expect(mark?.dataset.state).toBe('progress');
    expect(mark?.dataset.progress).toBe('55');
    expect(mark?.style.getPropertyValue('--y-brand-progress')).toBe('55%');
    expect(mark?.querySelectorAll('svg')).toHaveLength(3);
  });

  it('clamps over-goal reading and exposes the completed gold state', async () => {
    const container = await renderForSmoke(
      <BrandLockup compact progress={{ effectiveWords: 640, thresholdWords: 500 }} />,
    );
    const lockup = container.querySelector<HTMLElement>('.yuel-brand');
    const mark = container.querySelector<HTMLElement>('.yuel-brand__mark');

    expect(lockup?.getAttribute('aria-valuenow')).toBe('500');
    expect(lockup?.getAttribute('aria-valuetext')).toContain('今日已完成打卡，共 640 个有效词');
    expect(mark?.dataset.state).toBe('complete');
    expect(mark?.dataset.progress).toBe('100');
    expect(mark?.style.getPropertyValue('--y-brand-progress')).toBe('100%');
    expect(mark?.querySelector('.yuel-brand__mark-layer--celebration')).not.toBeNull();
  });

  it('keeps an unavailable progress source neutral without reporting a false value', async () => {
    const container = await renderForSmoke(<BrandLockup progressStatus="unavailable" />);
    const lockup = container.querySelector<HTMLElement>('.yuel-brand');
    const mark = container.querySelector<HTMLElement>('.yuel-brand__mark');

    expect(lockup?.hasAttribute('aria-valuenow')).toBe(false);
    expect(lockup?.getAttribute('aria-valuetext')).toBe('今日阅读进度暂不可用');
    expect(mark?.dataset.state).toBe('unavailable');
    expect(mark?.dataset.progress).toBe('0');
  });
});
