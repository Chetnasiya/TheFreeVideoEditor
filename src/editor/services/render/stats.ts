/** Counters for leak and performance checks. Cheap integer bumps; only read by DEV test hooks. */
export interface RenderStats {
	renderer: 'webgl2' | 'canvas2d';
	gpuRenderer: string;
	texturesCreated: number;
	texturesDeleted: number;
	textureUploads: number;
	programsCreated: number;
	programsDeleted: number;
	drawCalls: number;
	frames: number;
	contextLosses: number;
	contextRestores: number;
	lastFrameMs: number;
	maxFrameMs: number;
	totalFrameMs: number;
}

export function createRenderStats(renderer: RenderStats['renderer']): RenderStats {
	return {
		renderer,
		gpuRenderer: '',
		texturesCreated: 0,
		texturesDeleted: 0,
		textureUploads: 0,
		programsCreated: 0,
		programsDeleted: 0,
		drawCalls: 0,
		frames: 0,
		contextLosses: 0,
		contextRestores: 0,
		lastFrameMs: 0,
		maxFrameMs: 0,
		totalFrameMs: 0
	};
}

export function liveTextures(stats: RenderStats): number {
	return stats.texturesCreated - stats.texturesDeleted;
}
