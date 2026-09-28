import { describe, it, expect } from 'vitest';
import { normalizeXboxImageUrl } from '../lib/utils/xbox-images';

describe('Xbox Image URL Normalization', () => {
  it('should upgrade http to https', () => {
    const url = 'http://store-images.s-microsoft.com/image/apps.12345.jpg';
    const normalized = normalizeXboxImageUrl(url);
    expect(normalized).toBe('https://store-images.s-microsoft.com/image/apps.12345.jpg?w=600');
  });

  it('should add ?w=600 to store-images.s-microsoft.com URLs without w param', () => {
    const url = 'https://store-images.s-microsoft.com/image/apps.12345.jpg';
    const normalized = normalizeXboxImageUrl(url);
    expect(normalized).toBe('https://store-images.s-microsoft.com/image/apps.12345.jpg?w=600');
  });

  it('should not add ?w=600 if w param already exists', () => {
    const url = 'https://store-images.s-microsoft.com/image/apps.12345.jpg?w=300';
    const normalized = normalizeXboxImageUrl(url);
    expect(normalized).toBe('https://store-images.s-microsoft.com/image/apps.12345.jpg?w=300');
  });

  it('should handle already https URLs from other hosts', () => {
    const url = 'https://images-eds-ssl.xboxlive.com/image/abc123.jpg';
    const normalized = normalizeXboxImageUrl(url);
    expect(normalized).toBe('https://images-eds-ssl.xboxlive.com/image/abc123.jpg');
  });

  it('should upgrade http for other Xbox hosts without adding w param', () => {
    const url = 'http://images-eds-ssl.xboxlive.com/image/abc123.jpg';
    const normalized = normalizeXboxImageUrl(url);
    expect(normalized).toBe('https://images-eds-ssl.xboxlive.com/image/abc123.jpg');
  });

  it('should handle undefined URLs', () => {
    const normalized = normalizeXboxImageUrl(undefined);
    expect(normalized).toBeUndefined();
  });

  it('should handle empty URLs', () => {
    const normalized = normalizeXboxImageUrl('');
    expect(normalized).toBeUndefined();
  });

  it('should upgrade http and add w param in one operation', () => {
    const url = 'http://store-images.s-microsoft.com/image/apps.31326.jpg';
    const normalized = normalizeXboxImageUrl(url);
    expect(normalized).toBe('https://store-images.s-microsoft.com/image/apps.31326.jpg?w=600');
  });

  it('should rewrite the non-SSL images-eds host to images-eds-ssl (TLS cert mismatch)', () => {
    const url = 'http://images-eds.xboxlive.com/image?url=abc--';
    expect(normalizeXboxImageUrl(url)).toBe('https://images-eds-ssl.xboxlive.com/image?url=abc--');
    expect(normalizeXboxImageUrl('https://images-eds.xboxlive.com/image?url=abc--')).toBe(
      'https://images-eds-ssl.xboxlive.com/image?url=abc--'
    );
  });
});

import { normalizeXboxAvatarUrl } from '../lib/utils/xbox-images';
describe('normalizeXboxAvatarUrl', () => {
  it('adds a size to legacy mode=Padding gamerpics (400 without one)', () => {
    const u = 'https://images-eds-ssl.xboxlive.com/image?url=abc&background=0xababab&mode=Padding&format=png';
    expect(normalizeXboxAvatarUrl(u)).toBe(u + '&w=208&h=208');
  });
  it('leaves modern gamerpics unchanged', () => {
    const u = 'https://images-eds-ssl.xboxlive.com/image?url=abc&format=png';
    expect(normalizeXboxAvatarUrl(u)).toBe(u);
  });
});
