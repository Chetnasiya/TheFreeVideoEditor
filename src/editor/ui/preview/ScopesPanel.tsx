import { useEffect, useRef } from 'react';
import type { PlaybackEngine } from '../../services/playback/engine';
import type { ScopeFrameData } from '../../services/render/passes/scopes';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import './scopes.css';

interface ScopesPanelProps {
	engine: PlaybackEngine | null;
	onClose?: () => void;
	onSelectView?: (view: 'source' | 'scopes') => void;
	activeView?: 'source' | 'scopes';
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
			<div className="scopes-header">
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
							className="scopes-tab-btn scopes-channel-btn"
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
			</div>

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
	// Sync canvas logical resolution to physical element display size
	const rect = canvas.getBoundingClientRect();
	const dpr = Math.min(window.devicePixelRatio || 1, 2);
	const targetWidth = Math.max(320, Math.round((rect.width || 320) * dpr));
	const targetHeight = Math.max(200, Math.round((rect.height || 200) * dpr));

	if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
		canvas.width = targetWidth;
		canvas.height = targetHeight;
	}

	const ctx = canvas.getContext('2d');
	if (!ctx) return;

	const w = canvas.width;
	const h = canvas.height;

	// Deep studio black canvas with subtle vignette
	const bg = ctx.createLinearGradient(0, 0, 0, h);
	bg.addColorStop(0, '#0a0d11');
	bg.addColorStop(1, '#05070a');
	ctx.fillStyle = bg;
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

function drawGraticule(
	ctx: CanvasRenderingContext2D,
	x: number,
	y: number,
	w: number,
	h: number,
	channelLabel?: string,
	labelColor?: string
) {
	const usableH = h - 28;
	const topOffset = 14;

	// Reference IRE levels (0% to 100% plus broadcast limits)
	const ireLevels = [
		{ ire: 100, label: '100', color: 'rgba(239, 68, 68, 0.35)', dash: [] },
		{ ire: 80, label: '80', color: 'rgba(255, 255, 255, 0.08)', dash: [2, 4] },
		{ ire: 60, label: '60', color: 'rgba(255, 255, 255, 0.08)', dash: [2, 4] },
		{ ire: 40, label: '40', color: 'rgba(255, 255, 255, 0.08)', dash: [2, 4] },
		{ ire: 20, label: '20', color: 'rgba(255, 255, 255, 0.08)', dash: [2, 4] },
		{ ire: 0, label: '0', color: 'rgba(56, 189, 248, 0.35)', dash: [] }
	];

	ctx.save();
	ctx.lineWidth = 1;
	ctx.font = '9px "JetBrains Mono", Menlo, Consolas, monospace';

	for (const { ire, label, color, dash } of ireLevels) {
		const lineY = Math.round(y + topOffset + (1 - ire / 100) * usableH) + 0.5;

		ctx.beginPath();
		ctx.setLineDash(dash);
		ctx.strokeStyle = color;
		ctx.moveTo(x + 24, lineY);
		ctx.lineTo(x + w - 6, lineY);
		ctx.stroke();

		// IRE Label
		ctx.fillStyle = ire === 100 ? '#f87171' : ire === 0 ? '#38bdf8' : '#64748b';
		ctx.textAlign = 'right';
		ctx.fillText(label, x + 20, lineY + 3);
	}

	// Channel title if provided
	if (channelLabel) {
		ctx.fillStyle = labelColor || '#94a3b8';
		ctx.font = 'bold 10px sans-serif';
		ctx.textAlign = 'center';
		ctx.fillText(channelLabel, x + w / 2, y + 12);
	}

	ctx.restore();
}

function drawWaveform(
	ctx: CanvasRenderingContext2D,
	frame: ScopeFrameData | null,
	w: number,
	h: number,
	channel: 'luma' | 'rgb'
) {
	drawGraticule(ctx, 0, 0, w, h, channel === 'luma' ? 'LUMA (IRE)' : 'RGB OVERLAY');
	if (!frame) return;

	const { width: fw, height: fh, data } = frame;
	const usableH = h - 28;
	const topOffset = 14;
	const plotLeft = 25;
	const plotWidth = w - 32;

	ctx.save();
	ctx.globalCompositeOperation = 'screen';

	for (let py = 0; py < fh; py += 1) {
		for (let px = 0; px < fw; px += 1) {
			const i = (py * fw + px) * 4;
			const r = data[i]! / 255;
			const g = data[i + 1]! / 255;
			const b = data[i + 2]! / 255;
			const targetX = plotLeft + (px / fw) * plotWidth;

			if (channel === 'luma') {
				// Rec.709 Luminance
				const y = 0.2126 * r + 0.7152 * g + 0.0722 * b;
				const targetY = topOffset + (1 - y) * usableH;
				// Phosphor green waveform
				ctx.fillStyle = 'rgba(74, 222, 128, 0.28)';
				ctx.fillRect(targetX, targetY, 1.5, 1.5);
			} else {
				// Premiere Pro RGB Overlay
				const ry = topOffset + (1 - r) * usableH;
				const gy = topOffset + (1 - g) * usableH;
				const by = topOffset + (1 - b) * usableH;

				ctx.fillStyle = 'rgba(248, 113, 113, 0.22)';
				ctx.fillRect(targetX, ry, 1.4, 1.4);
				ctx.fillStyle = 'rgba(74, 222, 128, 0.22)';
				ctx.fillRect(targetX, gy, 1.4, 1.4);
				ctx.fillStyle = 'rgba(96, 165, 250, 0.22)';
				ctx.fillRect(targetX, by, 1.4, 1.4);
			}
		}
	}
	ctx.restore();
}

function drawParade(
	ctx: CanvasRenderingContext2D,
	frame: ScopeFrameData | null,
	w: number,
	h: number
) {
	const colW = w / 3;
	const usableH = h - 28;
	const topOffset = 14;

	drawGraticule(ctx, 0, 0, colW, h, 'RED', '#f87171');
	drawGraticule(ctx, colW, 0, colW, h, 'GREEN', '#4ade80');
	drawGraticule(ctx, colW * 2, 0, colW, h, 'BLUE', '#60a5fa');

	// Column separators
	ctx.save();
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
	ctx.lineWidth = 1;
	ctx.beginPath();
	ctx.moveTo(colW, 4);
	ctx.lineTo(colW, h - 4);
	ctx.moveTo(colW * 2, 4);
	ctx.lineTo(colW * 2, h - 4);
	ctx.stroke();
	ctx.restore();

	if (!frame) return;

	const { width: fw, height: fh, data } = frame;
	const plotLeft = 24;
	const plotColWidth = colW - 30;

	ctx.save();
	ctx.globalCompositeOperation = 'screen';

	for (let py = 0; py < fh; py += 1) {
		for (let px = 0; px < fw; px += 1) {
			const i = (py * fw + px) * 4;
			const r = data[i]! / 255;
			const g = data[i + 1]! / 255;
			const b = data[i + 2]! / 255;

			const relX = plotLeft + (px / fw) * plotColWidth;

			// Red column
			ctx.fillStyle = 'rgba(248, 113, 113, 0.28)';
			ctx.fillRect(relX, topOffset + (1 - r) * usableH, 1.5, 1.5);

			// Green column
			ctx.fillStyle = 'rgba(74, 222, 128, 0.28)';
			ctx.fillRect(colW + relX, topOffset + (1 - g) * usableH, 1.5, 1.5);

			// Blue column
			ctx.fillStyle = 'rgba(96, 165, 250, 0.28)';
			ctx.fillRect(colW * 2 + relX, topOffset + (1 - b) * usableH, 1.5, 1.5);
		}
	}
	ctx.restore();
}

function drawHistogram(
	ctx: CanvasRenderingContext2D,
	frame: ScopeFrameData | null,
	w: number,
	h: number
) {
	const usableH = h - 36;
	const top = 16;
	const bottom = h - 20;
	const left = 24;
	const right = w - 16;
	const graphW = right - left;

	// Grid border & divisions
	ctx.save();
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
	ctx.lineWidth = 1;
	ctx.strokeRect(left, top, graphW, usableH);

	// Ticks (0, 64, 128, 192, 255)
	ctx.fillStyle = '#64748b';
	ctx.font = '9px "JetBrains Mono", Menlo, Consolas, monospace';
	ctx.textAlign = 'center';
	const ticks = [0, 64, 128, 192, 255];
	for (const t of ticks) {
		const tx = left + (t / 255) * graphW;
		ctx.beginPath();
		ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
		ctx.setLineDash([2, 4]);
		ctx.moveTo(tx, top);
		ctx.lineTo(tx, bottom);
		ctx.stroke();
		ctx.fillText(`${t}`, tx, bottom + 12);
	}
	ctx.restore();

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

	const drawChannelCurve = (hist: Uint32Array, fillColor: string, strokeColor: string) => {
		ctx.save();
		ctx.beginPath();
		ctx.moveTo(left, bottom);
		for (let i = 0; i < 256; i++) {
			const x = left + (i / 255) * graphW;
			const count = hist[i]!;
			// Gentle log-like dampening to prevent shadow spikes from flattening the curve
			const normalized = Math.pow(count / maxCount, 0.85);
			const barH = normalized * usableH;
			ctx.lineTo(x, bottom - barH);
		}
		ctx.lineTo(right, bottom);
		ctx.closePath();
		ctx.fillStyle = fillColor;
		ctx.fill();

		ctx.strokeStyle = strokeColor;
		ctx.lineWidth = 1.2;
		ctx.stroke();
		ctx.restore();
	};

	ctx.save();
	ctx.globalCompositeOperation = 'screen';
	drawChannelCurve(rHist, 'rgba(239, 68, 68, 0.35)', 'rgba(248, 113, 113, 0.8)');
	drawChannelCurve(gHist, 'rgba(34, 197, 94, 0.35)', 'rgba(74, 222, 128, 0.8)');
	drawChannelCurve(bHist, 'rgba(59, 130, 246, 0.35)', 'rgba(96, 165, 250, 0.8)');
	ctx.restore();
}

function drawVectorscope(
	ctx: CanvasRenderingContext2D,
	frame: ScopeFrameData | null,
	w: number,
	h: number
) {
	const cx = w / 2;
	const cy = h / 2;
	const radius = Math.min(cx, cy) - 22;

	ctx.save();
	// Graticule concentric rings
	ctx.lineWidth = 1;
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.1)';
	ctx.beginPath();
	ctx.arc(cx, cy, radius, 0, Math.PI * 2); // 100% saturation boundary
	ctx.stroke();

	ctx.strokeStyle = 'rgba(56, 189, 248, 0.25)';
	ctx.setLineDash([3, 3]);
	ctx.beginPath();
	ctx.arc(cx, cy, radius * 0.75, 0, Math.PI * 2); // 75% broadcast limit
	ctx.stroke();

	// Crosshairs
	ctx.setLineDash([2, 4]);
	ctx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
	ctx.beginPath();
	ctx.moveTo(cx - radius - 6, cy);
	ctx.lineTo(cx + radius + 6, cy);
	ctx.moveTo(cx, cy - radius - 6);
	ctx.lineTo(cx, cy + radius + 6);
	ctx.stroke();

	// Skin tone line (I-axis ~ 123 degrees)
	const skinAngle = ((123 - 90) * Math.PI) / 180;
	ctx.setLineDash([]);
	ctx.strokeStyle = 'rgba(251, 146, 60, 0.65)';
	ctx.lineWidth = 1.2;
	ctx.beginPath();
	ctx.moveTo(cx, cy);
	ctx.lineTo(cx + Math.cos(skinAngle) * radius * 0.95, cy + Math.sin(skinAngle) * radius * 0.95);
	ctx.stroke();

	// Target boxes (Rec. 709 75% Saturation)
	const targets = [
		{ label: 'R', color: '#f87171', cb: -0.1687 * 0.75, cr: 0.5 * 0.75 },
		{ label: 'Mg', color: '#e879f9', cb: 0.3313 * 0.75, cr: 0.4187 * 0.75 },
		{ label: 'B', color: '#60a5fa', cb: 0.5 * 0.75, cr: -0.0813 * 0.75 },
		{ label: 'Cy', color: '#22d3ee', cb: 0.1687 * 0.75, cr: -0.5 * 0.75 },
		{ label: 'G', color: '#4ade80', cb: -0.3313 * 0.75, cr: -0.4187 * 0.75 },
		{ label: 'Yl', color: '#facc15', cb: -0.5 * 0.75, cr: 0.0813 * 0.75 }
	];

	ctx.font = 'bold 9px "JetBrains Mono", Menlo, Consolas, monospace';
	for (const t of targets) {
		const tx = cx + t.cb * radius * 2.2;
		const ty = cy - t.cr * radius * 2.2;

		// Precision target square + center dot
		ctx.strokeStyle = t.color;
		ctx.strokeRect(tx - 3.5, ty - 3.5, 7, 7);
		ctx.fillStyle = t.color;
		ctx.fillRect(tx - 0.5, ty - 0.5, 1, 1);

		// Label
		ctx.fillStyle = '#cbd5e1';
		ctx.textAlign = 'left';
		ctx.fillText(t.label, tx + 6, ty + 3);
	}
	ctx.restore();

	if (!frame) return;

	// High density chromatic phosphor points
	const { width: fw, height: fh, data } = frame;
	ctx.save();
	ctx.globalCompositeOperation = 'screen';

	for (let py = 0; py < fh; py += 1) {
		for (let px = 0; px < fw; px += 1) {
			const i = (py * fw + px) * 4;
			const r = data[i]! / 255;
			const g = data[i + 1]! / 255;
			const b = data[i + 2]! / 255;

			const cb = -0.1146 * r - 0.3854 * g + 0.5 * b;
			const cr = 0.5 * r - 0.4542 * g - 0.0458 * b;

			const px_out = cx + cb * radius * 2.2;
			const py_out = cy - cr * radius * 2.2;

			// Phosphor green hue scatter
			ctx.fillStyle = 'rgba(74, 222, 128, 0.28)';
			ctx.fillRect(px_out, py_out, 1.4, 1.4);
		}
	}
	ctx.restore();
}
