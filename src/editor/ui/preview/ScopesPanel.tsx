import { useEffect, useRef } from 'react';
import type { PlaybackEngine } from '../../services/playback/engine';
import type { ScopeFrameData } from '../../services/render/passes/scopes';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import './scopes.css';

interface ScopesPanelProps {
	engine: PlaybackEngine | null;
	onClose?: () => void;
}

export default function ScopesPanel({ engine, onClose }: ScopesPanelProps) {
	const store = useEditorStoreApi();
	const mode = useEditorStore((state) => state.scopes.mode);
	const channel = useEditorStore((state) => state.scopes.channel);
	const canvasRef = useRef<HTMLCanvasElement>(null);
	const animHandleRef = useRef<number | null>(null);

	useEffect(() => {
		engine?.enableScopes(true);
	}, [engine]);

	useEffect(() => {
		let lastRenderTime = 0;

		const renderLoop = (time: number) => {
			if (time - lastRenderTime >= 33) {
				// Cap scope canvas update to ~30 fps
				lastRenderTime = time;
				const frame = engine?.getLastScopeFrame() ?? null;
				const canvas = canvasRef.current;
				if (canvas) {
					drawScope(canvas, frame, mode, channel);
				}
			}
			animHandleRef.current = requestAnimationFrame(renderLoop);
		};

		animHandleRef.current = requestAnimationFrame(renderLoop);
		return () => {
			if (animHandleRef.current !== null) {
				cancelAnimationFrame(animHandleRef.current);
			}
		};
	}, [engine, mode, channel]);

	return (
		<div className="scopes-panel" role="region" aria-label="Video Scopes">
			{/* <div className="scopes-header">
				<div className="scopes-mode-tabs" role="tablist">
					{(['waveform', 'parade', 'histogram', 'vectorscope'] as const).map((m) => (
						<button
							key={m}
							type="button"
							role="tab"
							aria-selected={mode === m}
							className={`scopes-tab-btn ${mode === m ? 'is-active' : ''}`}
							onClick={() => store.getState().setScopesMode(m)}
						>
							{m.charAt(0).toUpperCase() + m.slice(1)}
						</button>
					))}
				</div>

				<div className="scopes-channel-toggle">
					{mode === 'waveform' && (
						<button
							type="button"
							className="scopes-tab-btn"
							onClick={() => store.getState().setScopesChannel(channel === 'luma' ? 'rgb' : 'luma')}
						>
							{channel.toUpperCase()}
						</button>
					)}
					<button
						type="button"
						className="scopes-close-btn"
						title="Close scopes"
						aria-label="Close scopes"
						onClick={() => {
							store.getState().setScopesOpen(false);
							onClose?.();
						}}
					>
						×
					</button>
				</div>
			</div> */}

			<div className="scopes-canvas-container">
				<canvas ref={canvasRef} width={256} height={180} className="scopes-canvas" />
			</div>

			<div className="scopes-footer">
				<span>Rec.709 Video Scope</span>
				<span>{mode === 'vectorscope' ? '75% Target' : '0–100 IRE'}</span>
			</div>
		</div>
	);
}

function drawScope(
	canvas: HTMLCanvasElement,
	frame: ScopeFrameData | null,
	mode: 'waveform' | 'parade' | 'histogram' | 'vectorscope',
	channel: 'luma' | 'rgb'
): void {
	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	const w = canvas.width;
	const h = canvas.height;

	// Clear background
	ctx.fillStyle = '#050505';
	ctx.fillRect(0, 0, w, h);

	switch (mode) {
		case 'waveform':
			drawWaveform(ctx, frame, w, h, channel);
			break;
		case 'parade':
			drawParade(ctx, frame, w, h);
			break;
		case 'histogram':
			drawHistogram(ctx, frame, w, h);
			break;
		case 'vectorscope':
			drawVectorscope(ctx, frame, w, h);
			break;
	}
}

function drawGraticule(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number) {
	ctx.strokeStyle = '#222';
	ctx.lineWidth = 1;
	ctx.fillStyle = '#555';
	ctx.font = '8px monospace';

	const ireLevels = [0, 25, 50, 75, 100];
	for (const ire of ireLevels) {
		const lineY = y + (1 - ire / 100) * (h - 16) + 8;
		ctx.beginPath();
		ctx.moveTo(x, lineY);
		ctx.lineTo(x + w, lineY);
		ctx.stroke();

		ctx.fillText(`${ire}`, x + 4, lineY - 2);
	}
}

function drawWaveform(
	ctx: CanvasRenderingContext2D,
	frame: ScopeFrameData | null,
	w: number,
	h: number,
	channel: 'luma' | 'rgb'
) {
	drawGraticule(ctx, 0, 0, w, h);
	if (!frame) return;

	const { width: fw, height: fh, data } = frame;
	const usableH = h - 16;
	const topOffset = 8;

	ctx.globalCompositeOperation = 'screen';

	for (let py = 0; py < fh; py += 2) {
		for (let px = 0; px < fw; px += 2) {
			const i = (py * fw + px) * 4;
			const r = data[i]! / 255;
			const g = data[i + 1]! / 255;
			const b = data[i + 2]! / 255;
			const targetX = (px / fw) * w;

			if (channel === 'luma') {
				const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
				const targetY = topOffset + (1 - y) * usableH;
				ctx.fillStyle = 'rgba(70, 255, 70, 0.25)';
				ctx.fillRect(targetX, targetY, 1.5, 1.5);
			} else {
				ctx.fillStyle = 'rgba(255, 60, 60, 0.2)';
				ctx.fillRect(targetX, topOffset + (1 - r) * usableH, 1.2, 1.2);
				ctx.fillStyle = 'rgba(60, 255, 60, 0.2)';
				ctx.fillRect(targetX, topOffset + (1 - g) * usableH, 1.2, 1.2);
				ctx.fillStyle = 'rgba(60, 100, 255, 0.2)';
				ctx.fillRect(targetX, topOffset + (1 - b) * usableH, 1.2, 1.2);
			}
		}
	}
	ctx.globalCompositeOperation = 'source-over';
}

function drawParade(
	ctx: CanvasRenderingContext2D,
	frame: ScopeFrameData | null,
	w: number,
	h: number
) {
	const colW = w / 3;
	const usableH = h - 16;
	const topOffset = 8;

	drawGraticule(ctx, 0, 0, colW, h);
	drawGraticule(ctx, colW, 0, colW, h);
	drawGraticule(ctx, colW * 2, 0, colW, h);

	if (!frame) return;

	const { width: fw, height: fh, data } = frame;

	ctx.globalCompositeOperation = 'screen';
	for (let py = 0; py < fh; py += 2) {
		for (let px = 0; px < fw; px += 2) {
			const i = (py * fw + px) * 4;
			const r = data[i]! / 255;
			const g = data[i + 1]! / 255;
			const b = data[i + 2]! / 255;

			const relX = (px / fw) * colW;

			// Red column
			ctx.fillStyle = 'rgba(255, 70, 70, 0.22)';
			ctx.fillRect(relX, topOffset + (1 - r) * usableH, 1.5, 1.5);

			// Green column
			ctx.fillStyle = 'rgba(70, 255, 70, 0.22)';
			ctx.fillRect(colW + relX, topOffset + (1 - g) * usableH, 1.5, 1.5);

			// Blue column
			ctx.fillStyle = 'rgba(70, 120, 255, 0.22)';
			ctx.fillRect(colW * 2 + relX, topOffset + (1 - b) * usableH, 1.5, 1.5);
		}
	}
	ctx.globalCompositeOperation = 'source-over';
}

function drawHistogram(
	ctx: CanvasRenderingContext2D,
	frame: ScopeFrameData | null,
	w: number,
	h: number
) {
	const usableH = h - 16;
	const bottom = h - 8;

	// Grid
	ctx.strokeStyle = '#222';
	ctx.strokeRect(8, 8, w - 16, usableH);

	if (!frame) return;

	const rHist = new Uint32Array(256);
	const gHist = new Uint32Array(256);
	const bHist = new Uint32Array(256);

	const { data } = frame;
	const len = data.length;
	for (let i = 0; i < len; i += 4) {
		rHist[data[i]!]! += 1;
		gHist[data[i + 1]!]! += 1;
		bHist[data[i + 2]!]! += 1;
	}

	let maxCount = 1;
	for (let i = 0; i < 256; i++) {
		if (rHist[i]! > maxCount) maxCount = rHist[i]!;
		if (gHist[i]! > maxCount) maxCount = gHist[i]!;
		if (bHist[i]! > maxCount) maxCount = bHist[i]!;
	}

	const drawChannel = (hist: Uint32Array, color: string) => {
		ctx.fillStyle = color;
		ctx.beginPath();
		ctx.moveTo(8, bottom);
		for (let i = 0; i < 256; i++) {
			const x = 8 + (i / 255) * (w - 16);
			const count = hist[i]!;
			const barH = (count / maxCount) * usableH;
			ctx.lineTo(x, bottom - barH);
		}
		ctx.lineTo(w - 8, bottom);
		ctx.closePath();
		ctx.fill();
	};

	ctx.globalCompositeOperation = 'screen';
	drawChannel(rHist, 'rgba(255, 50, 50, 0.4)');
	drawChannel(gHist, 'rgba(50, 255, 50, 0.4)');
	drawChannel(bHist, 'rgba(50, 100, 255, 0.4)');
	ctx.globalCompositeOperation = 'source-over';
}

function drawVectorscope(
	ctx: CanvasRenderingContext2D,
	frame: ScopeFrameData | null,
	w: number,
	h: number
) {
	const cx = w / 2;
	const cy = h / 2;
	const radius = Math.min(cx, cy) - 16;

	// Graticule circles
	ctx.strokeStyle = '#222';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2);
	ctx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2);
	ctx.moveTo(cx - radius, cy);
	ctx.lineTo(cx + radius, cy);
	ctx.moveTo(cx, cy - radius);
	ctx.lineTo(cx, cy + radius);
	ctx.stroke();

	// Skin tone indicator (123 degrees)
	const skinAngle = ((123 - 90) * Math.PI) / 180;
	ctx.strokeStyle = '#664422';
	ctx.beginPath();
	ctx.moveTo(cx, cy);
	ctx.lineTo(cx + Math.cos(skinAngle) * radius, cy + Math.sin(skinAngle) * radius);
	ctx.stroke();

	// Rec.709 Color targets (75% Saturation)
	const targets = [
		{ label: 'R', cb: -0.1687 * 0.75, cr: 0.5 * 0.75 },
		{ label: 'G', cb: -0.3313 * 0.75, cr: -0.4187 * 0.75 },
		{ label: 'B', cb: 0.5 * 0.75, cr: -0.0813 * 0.75 },
		{ label: 'Cy', cb: 0.1687 * 0.75, cr: -0.5 * 0.75 },
		{ label: 'Mg', cb: 0.3313 * 0.75, cr: 0.4187 * 0.75 },
		{ label: 'Yl', cb: -0.5 * 0.75, cr: 0.0813 * 0.75 }
	];

	ctx.strokeStyle = '#444';
	ctx.fillStyle = '#666';
	ctx.font = '8px monospace';
	for (const t of targets) {
		const tx = cx + t.cb * radius * 2.2;
		const ty = cy - t.cr * radius * 2.2;
		ctx.strokeRect(tx - 3, ty - 3, 6, 6);
		ctx.fillText(t.label, tx + 5, ty + 3);
	}

	if (!frame) return;

	// Plot frame points
	const { width: fw, height: fh, data } = frame;
	ctx.globalCompositeOperation = 'screen';
	for (let py = 0; py < fh; py += 2) {
		for (let px = 0; px < fw; px += 2) {
			const i = (py * fw + px) * 4;
			const r = data[i]! / 255;
			const g = data[i + 1]! / 255;
			const b = data[i + 2]! / 255;

			const cb = -0.1146 * r - 0.3854 * g + 0.5 * b;
			const cr = 0.5 * r - 0.4542 * g - 0.0458 * b;

			const px_out = cx + cb * radius * 2.2;
			const py_out = cy - cr * radius * 2.2;

			ctx.fillStyle = 'rgba(70, 255, 120, 0.25)';
			ctx.fillRect(px_out, py_out, 1.5, 1.5);
		}
	}
	ctx.globalCompositeOperation = 'source-over';
}
