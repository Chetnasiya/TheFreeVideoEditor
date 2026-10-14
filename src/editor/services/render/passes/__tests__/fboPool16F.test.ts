import { describe, expect, it, vi } from 'vitest';
import { FboPool } from '../FboPool';

describe('FboPool Half-Float & RGBA8 Support', () => {
	it('allocates and distinguishes standard RGBA8 vs RGBA16F half-float textures', () => {
		const texImages: Array<{ internalFormat: number; type: number }> = [];

		const mockGl = {
			RGBA8: 0x8058,
			RGBA16F: 0x881a,
			RGBA: 0x1908,
			UNSIGNED_BYTE: 0x1401,
			HALF_FLOAT: 0x140b,
			TEXTURE_2D: 0x0de1,
			TEXTURE_MIN_FILTER: 0x2801,
			TEXTURE_MAG_FILTER: 0x2800,
			TEXTURE_WRAP_S: 0x2802,
			TEXTURE_WRAP_T: 0x2803,
			LINEAR: 0x2601,
			CLAMP_TO_EDGE: 0x812f,
			FRAMEBUFFER: 0x8d40,
			FRAMEBUFFER_COMPLETE: 0x8cd5,
			COLOR_ATTACHMENT0: 0x8ce0,
			createTexture: vi.fn(() => ({ id: Math.random() })),
			bindTexture: vi.fn(),
			texParameteri: vi.fn(),
			texImage2D: vi.fn(
				(
					_target: number,
					_level: number,
					internalFormat: number,
					_w: number,
					_h: number,
					_border: number,
					_fmt: number,
					type: number
				) => {
					texImages.push({ internalFormat, type });
				}
			),
			createFramebuffer: vi.fn(() => ({ id: Math.random() })),
			bindFramebuffer: vi.fn(),
			framebufferTexture2D: vi.fn(),
			checkFramebufferStatus: vi.fn(() => 0x8cd5), // FRAMEBUFFER_COMPLETE
			deleteTexture: vi.fn(),
			deleteFramebuffer: vi.fn(),
			getExtension: vi.fn((ext: string) => (ext === 'EXT_color_buffer_float' ? {} : null))
		} as unknown as WebGL2RenderingContext;

		const pool = new FboPool(mockGl);

		// 1. Acquire standard 8-bit FBO
		const fbo8 = pool.acquire(1920, 1080, false);
		expect(fbo8.isHalfFloat).toBe(false);
		expect(texImages[0]?.internalFormat).toBe(mockGl.RGBA8);
		expect(texImages[0]?.type).toBe(mockGl.UNSIGNED_BYTE);

		// 2. Acquire half-float 16-bit FBO
		const fbo16 = pool.acquire(1920, 1080, true);
		expect(fbo16.isHalfFloat).toBe(true);
		expect(texImages[1]?.internalFormat).toBe(mockGl.RGBA16F);
		expect(texImages[1]?.type).toBe(mockGl.HALF_FLOAT);

		// 3. Pool keys must keep them separated
		pool.release(fbo8);
		pool.release(fbo16);

		// Re-acquiring 16-bit returns the 16-bit item
		const fbo16_again = pool.acquire(1920, 1080, true);
		expect(fbo16_again.isHalfFloat).toBe(true);
		expect(fbo16_again).toBe(fbo16);

		// Re-acquiring 8-bit returns the 8-bit item
		const fbo8_again = pool.acquire(1920, 1080, false);
		expect(fbo8_again.isHalfFloat).toBe(false);
		expect(fbo8_again).toBe(fbo8);

		pool.dispose();
		expect(pool.totalLive).toBe(0);
	});
});
