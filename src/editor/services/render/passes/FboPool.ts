export interface PooledFbo {
	framebuffer: WebGLFramebuffer;
	texture: WebGLTexture;
	width: number;
	height: number;
	isHalfFloat?: boolean;
}

export class FboPool {
	private readonly pool = new Map<string, PooledFbo[]>();
	private inUse = new Set<PooledFbo>();
	public totalCreated = 0;
	constructor(private readonly gl: WebGL2RenderingContext) {}

	get totalLive(): number {
		let pooledCount = 0;
		for (const list of this.pool.values()) pooledCount += list.length;
		return this.inUse.size + pooledCount;
	}

	acquire(width: number, height: number, halfFloat = false): PooledFbo {
		const gl = this.gl;
		const key = `${width}:${height}:${halfFloat ? 'f16' : 'u8'}`;
		let list = this.pool.get(key);
		if (!list) {
			list = [];
			this.pool.set(key, list);
		}

		let item = list.pop();
		if (!item) {
			const texture = gl.createTexture();
			if (!texture) throw new Error('Failed to create WebGL texture for FBO');
			gl.bindTexture(gl.TEXTURE_2D, texture);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
			gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

			let internalFormat: number = gl.RGBA8;
			let type: number = gl.UNSIGNED_BYTE;
			let isActualHalfFloat = false;

			if (
				halfFloat &&
				(gl.getExtension('EXT_color_buffer_float') || gl.getExtension('WEBGL_color_buffer_float'))
			) {
				internalFormat = gl.RGBA16F;
				type = gl.HALF_FLOAT;
				isActualHalfFloat = true;
			}

			gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);

			const framebuffer = gl.createFramebuffer();
			if (!framebuffer) throw new Error('Failed to create WebGL framebuffer');
			gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
			gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);

			let status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
			if (status !== gl.FRAMEBUFFER_COMPLETE && isActualHalfFloat) {
				// Fallback to RGBA8 if RGBA16F framebuffer is incomplete
				internalFormat = gl.RGBA8;
				type = gl.UNSIGNED_BYTE;
				isActualHalfFloat = false;
				gl.texImage2D(gl.TEXTURE_2D, 0, internalFormat, width, height, 0, gl.RGBA, type, null);
				status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
			}

			if (status !== gl.FRAMEBUFFER_COMPLETE) {
				throw new Error(`Framebuffer incomplete: status ${status}`);
			}
			gl.bindFramebuffer(gl.FRAMEBUFFER, null);
			gl.bindTexture(gl.TEXTURE_2D, null);

			this.totalCreated += 1;
			item = { framebuffer, texture, width, height, isHalfFloat: isActualHalfFloat };
		}

		this.inUse.add(item);
		return item;
	}

	release(fbo: PooledFbo): void {
		if (!this.inUse.has(fbo)) return;
		this.inUse.delete(fbo);
		const key = `${fbo.width}:${fbo.height}:${fbo.isHalfFloat ? 'f16' : 'u8'}`;
		let list = this.pool.get(key);
		if (!list) {
			list = [];
			this.pool.set(key, list);
		}
		list.push(fbo);
	}

	dispose(): void {
		const gl = this.gl;
		for (const item of this.inUse) {
			gl.deleteTexture(item.texture);
			gl.deleteFramebuffer(item.framebuffer);
		}
		this.inUse.clear();

		for (const list of this.pool.values()) {
			for (const item of list) {
				gl.deleteTexture(item.texture);
				gl.deleteFramebuffer(item.framebuffer);
			}
		}
		this.pool.clear();
	}
}
