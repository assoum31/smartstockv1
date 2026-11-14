import { describe, expect, it } from 'vitest';
import { mayRegisterWorker } from '@/lib/pwa';

describe('offline publication safety', () => {
  it('allows the published phone and desktop domain', () => {
    expect(mayRegisterWorker('stoky.online', true, false, false)).toBe(true);
  });
  it('never caches dev or iframe previews', () => {
    expect(mayRegisterWorker('localhost', false, false, false)).toBe(false);
    expect(mayRegisterWorker('stoky.online', true, true, false)).toBe(false);
    expect(mayRegisterWorker('id-preview--8cbdca71-3941-4dd2-8354-ead404e5763a.lovable.app', true, false, false)).toBe(false);
    expect(mayRegisterWorker('preview-2--example.lovable.app', true, false, false)).toBe(false);
  });
  it('honours the offline cache kill switch', () => {
    expect(mayRegisterWorker('stoky.online', true, false, true)).toBe(false);
  });
});