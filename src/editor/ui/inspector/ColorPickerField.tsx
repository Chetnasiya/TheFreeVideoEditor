import { useState, useRef, useEffect } from 'react';
import { rgbToHex, hexToRgb, hexToRgba, clamp01 } from '../../core/colorMath';

export type GradientType =
	'none' | 'linear-horizontal' | 'linear-vertical' | 'radial' | 'linear-angle';

export interface GradientValue {
	type?: GradientType;
	colorEnd?:
		| [number, number, number, number]
		| [number, number, number]
		| { r: number; g: number; b: number; a?: number }
		| string;
	angle?: number;
}

export interface GradientPreset {
	id: string;
	name: string;
	start: [number, number, number, number];
	end: [number, number, number, number];
	type?: GradientType;
}

export const GRADIENT_PRESETS: readonly GradientPreset[] = [
	{
		id: 'gold',
		name: 'Gold Luxury',
		start: [0.96, 0.62, 0.04, 1], // #F59E0B
		end: [0.93, 0.27, 0.27, 1] // #EF4444
	},
	{
		id: 'sunset',
		name: 'Sunset Glow',
		start: [0.92, 0.28, 0.6, 1], // #EC4899
		end: [0.96, 0.62, 0.04, 1] // #F59E0B
	},
	{
		id: 'cyber',
		name: 'Cyber Neon',
		start: [0.23, 0.51, 0.96, 1], // #3B82F6
		end: [0.55, 0.36, 0.96, 1] // #8B5CF6
	},
	{
		id: 'emerald',
		name: 'Emerald Mint',
		start: [0.06, 0.73, 0.51, 1], // #10B981
		end: [0.02, 0.71, 0.83, 1] // #06B6D4
	},
	{
		id: 'ocean',
		name: 'Deep Ocean',
		start: [0.01, 0.52, 0.78, 1], // #0284C7
		end: [0.39, 0.4, 0.95, 1] // #6366F1
	},
	{
		id: 'silver',
		name: 'Silver Chrome',
		start: [0.89, 0.91, 0.94, 1], // #E2E8F0
		end: [0.28, 0.33, 0.41, 1] // #475569
	},
	{
		id: 'fire',
		name: 'Crimson Flame',
		start: [0.93, 0.27, 0.27, 1], // #EF4444
		end: [0.5, 0.11, 0.11, 1] // #7F1D1D
	},
	{
		id: 'violet',
		name: 'Royal Violet',
		start: [0.55, 0.36, 0.96, 1], // #8B5CF6
		end: [0.92, 0.28, 0.6, 1] // #EC4899
	}
];

export interface ColorPickerFieldProps {
	/** Color value as [r, g, b, a], [r, g, b], { r, g, b, a }, or hex string */
	value:
		| [number, number, number, number]
		| [number, number, number]
		| { r: number; g: number; b: number; a?: number }
		| string;
	onChange: (rgba: [number, number, number, number], coalesce?: boolean) => void;
	label?: string;
	hasAlpha?: boolean;
	disabled?: boolean;
	showQuickPalette?: boolean;
	showRgbaChannels?: boolean;
	allowTransparent?: boolean;
	/** Optional gradient options and callback */
	gradient?: GradientValue;
	onGradientChange?: (gradient: {
		type: GradientType;
		colorEnd: [number, number, number, number];
		angle: number;
	}) => void;
}

const PRESET_SWATCHES = [
	'#FFFFFF',
	'#000000',
	'#EF4444',
	'#F59E0B',
	'#10B981',
	'#3B82F6',
	'#8B5CF6',
	'#EC4899'
];

function normalizeRgba(
	val:
		| [number, number, number, number]
		| [number, number, number]
		| { r: number; g: number; b: number; a?: number }
		| string
		| undefined
): [number, number, number, number] {
	if (!val) return [1, 1, 1, 1];
	if (Array.isArray(val)) {
		const r = clamp01(Number(val[0]) || 0);
		const g = clamp01(Number(val[1]) || 0);
		const b = clamp01(Number(val[2]) || 0);
		const a = val.length >= 4 ? clamp01(Number(val[3]) ?? 1) : 1;
		return [r, g, b, a];
	}
	if (typeof val === 'object' && val !== null) {
		return [
			clamp01(Number(val.r) || 0),
			clamp01(Number(val.g) || 0),
			clamp01(Number(val.b) || 0),
			val.a !== undefined ? clamp01(Number(val.a) || 0) : 1
		];
	}
	if (typeof val === 'string') {
		const parsed = hexToRgba(val);
		if (parsed) {
			return parsed;
		}
	}
	return [1, 1, 1, 1];
}

function rgbaToCssString(rgba: [number, number, number, number]): string {
	return `rgba(${Math.round(rgba[0] * 255)}, ${Math.round(rgba[1] * 255)}, ${Math.round(rgba[2] * 255)}, ${rgba[3]})`;
}

export function ColorPickerField({
	value,
	onChange,
	label = 'Color',
	hasAlpha = true,
	disabled = false,
	showQuickPalette = true,
	showRgbaChannels = false,
	allowTransparent = true,
	gradient,
	onGradientChange
}: ColorPickerFieldProps) {
	const startRgba = normalizeRgba(value);
	const endRgba = normalizeRgba(gradient?.colorEnd ?? [0.2, 0.2, 0.25, 1]);

	const supportsGradient = Boolean(onGradientChange);
	const isGradientMode = Boolean(supportsGradient && gradient?.type && gradient.type !== 'none');
	const gradType: GradientType =
		gradient?.type && gradient.type !== 'none' ? gradient.type : 'linear-horizontal';
	const gradAngle = gradient?.angle ?? 45;

	const [activeStop, setActiveStop] = useState<'start' | 'end'>('start');

	// The RGBA actively controlled by the color inputs below
	const activeRgba = isGradientMode && activeStop === 'end' ? endRgba : startRgba;
	const [r, g, b, a] = activeRgba;
	const hex = rgbToHex(r, g, b);
	const isTransparent = a < 0.005;
	const canBeTransparent = hasAlpha && allowTransparent && !isGradientMode;

	const [hexDraft, setHexDraft] = useState<string | null>(null);
	const [showChannels, setShowChannels] = useState(showRgbaChannels);
	const nativeColorInputRef = useRef<HTMLInputElement>(null);

	// Sync hexDraft when active color changes
	useEffect(() => {
		setHexDraft(null);
	}, [r, g, b, a, activeStop]);

	// Dispatch color update to active stop (start or end)
	const updateActiveColor = (nextRgba: [number, number, number, number], coalesce?: boolean) => {
		if (isGradientMode && activeStop === 'end') {
			onGradientChange?.({
				type: gradType,
				colorEnd: nextRgba,
				angle: gradAngle
			});
		} else {
			onChange(nextRgba, coalesce);
		}
	};

	const handleSetTransparent = () => {
		if (disabled || !canBeTransparent) return;
		updateActiveColor([r, g, b, 0], false);
	};

	const handleNativeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newHex = e.target.value;
		const parsed = hexToRgb(newHex);
		if (parsed) {
			const targetAlpha = isTransparent ? 1 : a;
			updateActiveColor([parsed[0], parsed[1], parsed[2], targetAlpha], false);
		}
	};

	const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const inputVal = e.target.value;
		setHexDraft(inputVal);

		const clean = inputVal.trim().toLowerCase();
		if (clean === 'transparent' || clean === 'none') {
			if (canBeTransparent) {
				updateActiveColor([r, g, b, 0], true);
			}
			return;
		}

		const parsedRgba = hexToRgba(inputVal);
		if (parsedRgba) {
			const cleanNoHash = clean.replace(/^#/, '');
			if (cleanNoHash.length === 4 || cleanNoHash.length === 8) {
				updateActiveColor(
					[parsedRgba[0], parsedRgba[1], parsedRgba[2], canBeTransparent ? parsedRgba[3] : 1],
					true
				);
			} else {
				const targetAlpha = isTransparent ? 1 : a;
				updateActiveColor([parsedRgba[0], parsedRgba[1], parsedRgba[2], targetAlpha], true);
			}
		}
	};

	const handleHexBlur = () => {
		if (hexDraft !== null) {
			const clean = hexDraft.trim().toLowerCase();
			if (clean === 'transparent' || clean === 'none') {
				if (canBeTransparent) {
					updateActiveColor([r, g, b, 0], false);
				}
				setHexDraft(null);
				return;
			}
			const parsedRgba = hexToRgba(hexDraft);
			if (parsedRgba) {
				const cleanNoHash = clean.replace(/^#/, '');
				if (cleanNoHash.length === 4 || cleanNoHash.length === 8) {
					updateActiveColor(
						[parsedRgba[0], parsedRgba[1], parsedRgba[2], canBeTransparent ? parsedRgba[3] : 1],
						false
					);
				} else {
					const targetAlpha = isTransparent ? 1 : a;
					updateActiveColor([parsedRgba[0], parsedRgba[1], parsedRgba[2], targetAlpha], false);
				}
			}
			setHexDraft(null);
		}
	};

	const handleHexKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			e.currentTarget.blur();
		} else if (e.key === 'Escape') {
			setHexDraft(null);
		}
	};

	const handleAlphaChange = (newAlphaPercent: number) => {
		const clampedAlpha = clamp01(newAlphaPercent / 100);
		updateActiveColor([r, g, b, clampedAlpha], true);
	};

	const handlePresetClick = (presetHex: string) => {
		if (disabled) return;
		const parsed = hexToRgb(presetHex);
		if (parsed) {
			const targetAlpha = isTransparent ? 1 : a;
			updateActiveColor([parsed[0], parsed[1], parsed[2], targetAlpha], false);
		}
	};

	const handleChannelChange = (channelIdx: number, val: number) => {
		const next: [number, number, number, number] = [r, g, b, a];
		next[channelIdx] = clamp01(val);
		updateActiveColor(next, true);
	};

	// Swap start and end colors
	const handleSwapStops = () => {
		if (disabled || !isGradientMode) return;
		onChange(endRgba, false);
		onGradientChange?.({
			type: gradType,
			colorEnd: startRgba,
			angle: gradAngle
		});
	};

	// Apply gradient preset
	const handleGradientPresetClick = (preset: GradientPreset) => {
		if (disabled) return;
		onChange(preset.start, false);
		onGradientChange?.({
			type: preset.type ?? gradType,
			colorEnd: preset.end,
			angle: gradAngle
		});
	};

	const alphaPercent = Math.round(a * 100);

	// CSS gradient for preview
	const startCss = rgbaToCssString(startRgba);
	const endCss = rgbaToCssString(endRgba);
	const previewCssGradient =
		gradType === 'linear-vertical'
			? `linear-gradient(180deg, ${startCss}, ${endCss})`
			: gradType === 'radial'
				? `radial-gradient(circle, ${startCss}, ${endCss})`
				: gradType === 'linear-angle'
					? `linear-gradient(${gradAngle}deg, ${startCss}, ${endCss})`
					: `linear-gradient(90deg, ${startCss}, ${endCss})`;

	return (
		<div className="color-picker-field-root">
			{/* Mode Switcher: Solid vs Gradient */}
			{supportsGradient && (
				<div className="color-mode-tabs" role="tablist" aria-label="Color Fill Mode">
					<button
						type="button"
						className={`color-mode-tab ${!isGradientMode ? 'is-active' : ''}`}
						onClick={() => {
							if (isGradientMode) {
								onGradientChange?.({
									type: 'none',
									colorEnd: endRgba,
									angle: gradAngle
								});
							}
						}}
						role="tab"
						aria-selected={!isGradientMode}
					>
						Solid Color
					</button>
					<button
						type="button"
						className={`color-mode-tab ${isGradientMode ? 'is-active' : ''}`}
						onClick={() => {
							if (!isGradientMode) {
								onGradientChange?.({
									type: gradType,
									colorEnd: endRgba,
									angle: gradAngle
								});
							}
						}}
						role="tab"
						aria-selected={isGradientMode}
					>
						Gradient Fill
					</button>
				</div>
			)}

			{/* Gradient Options Section */}
			{isGradientMode && (
				<div className="color-gradient-controls">
					{/* Gradient Types (Horizontal, Vertical, Angle, Radial) */}
					<div className="color-gradient-types-row" role="group" aria-label="Gradient Type">
						<button
							type="button"
							className={`color-gradient-type-btn ${gradType === 'linear-horizontal' ? 'is-active' : ''}`}
							onClick={() =>
								onGradientChange?.({
									type: 'linear-horizontal',
									colorEnd: endRgba,
									angle: gradAngle
								})
							}
							title="Horizontal Linear Gradient (Left to Right)"
						>
							<span>→</span> Horizontal
						</button>
						<button
							type="button"
							className={`color-gradient-type-btn ${gradType === 'linear-vertical' ? 'is-active' : ''}`}
							onClick={() =>
								onGradientChange?.({
									type: 'linear-vertical',
									colorEnd: endRgba,
									angle: gradAngle
								})
							}
							title="Vertical Linear Gradient (Top to Bottom)"
						>
							<span>↓</span> Vertical
						</button>
						<button
							type="button"
							className={`color-gradient-type-btn ${gradType === 'linear-angle' ? 'is-active' : ''}`}
							onClick={() =>
								onGradientChange?.({
									type: 'linear-angle',
									colorEnd: endRgba,
									angle: gradAngle
								})
							}
							title="Angle / Diagonal Linear Gradient"
						>
							<span>↗</span> Angle
						</button>
						<button
							type="button"
							className={`color-gradient-type-btn ${gradType === 'radial' ? 'is-active' : ''}`}
							onClick={() =>
								onGradientChange?.({
									type: 'radial',
									colorEnd: endRgba,
									angle: gradAngle
								})
							}
							title="Radial Gradient (Center Outward)"
						>
							<span>⦿</span> Radial
						</button>
					</div>

					{/* Live Gradient Preview Bar */}
					<div
						className="color-gradient-preview-bar"
						style={{ background: previewCssGradient }}
						title={`Live Gradient: ${previewCssGradient}`}
						aria-label="Active gradient preview"
					/>

					{/* Gradient Stops (Start, Swap, End) */}
					<div className="color-gradient-stops-row">
						<button
							type="button"
							className={`color-gradient-stop-chip ${activeStop === 'start' ? 'is-active' : ''}`}
							onClick={() => setActiveStop('start')}
							title="Edit Start Color"
						>
							<span
								className="color-gradient-stop-swatch"
								style={{ backgroundColor: rgbaToCssString(startRgba) }}
							/>
							<span>
								Start: #{rgbToHex(startRgba[0], startRgba[1], startRgba[2]).toUpperCase()}
							</span>
						</button>

						<button
							type="button"
							className="color-gradient-swap-btn"
							onClick={handleSwapStops}
							title="Swap Start and End Colors"
							aria-label="Swap gradient color stops"
						>
							⇄
						</button>

						<button
							type="button"
							className={`color-gradient-stop-chip ${activeStop === 'end' ? 'is-active' : ''}`}
							onClick={() => setActiveStop('end')}
							title="Edit End Color"
						>
							<span
								className="color-gradient-stop-swatch"
								style={{ backgroundColor: rgbaToCssString(endRgba) }}
							/>
							<span>End: #{rgbToHex(endRgba[0], endRgba[1], endRgba[2]).toUpperCase()}</span>
						</button>
					</div>

					{/* Angle Slider when linear-angle is selected */}
					{gradType === 'linear-angle' && (
						<div className="color-gradient-angle-row">
							<span className="color-gradient-angle-label">Angle:</span>
							<input
								type="range"
								min={0}
								max={360}
								step={1}
								value={gradAngle}
								onChange={(e) =>
									onGradientChange?.({
										type: 'linear-angle',
										colorEnd: endRgba,
										angle: Number(e.target.value) || 0
									})
								}
								className="color-gradient-angle-slider"
								aria-label="Gradient angle in degrees"
							/>
							<span className="color-gradient-angle-val">{Math.round(gradAngle)}°</span>
						</div>
					)}

					{/* Curated Gradient Presets Palette */}
					<div className="color-gradient-presets-grid" aria-label="Curated gradient presets">
						{GRADIENT_PRESETS.map((preset) => (
							<button
								key={preset.id}
								type="button"
								className="color-gradient-preset-swatch"
								style={{
									background: `linear-gradient(135deg, ${rgbaToCssString(preset.start)}, ${rgbaToCssString(preset.end)})`
								}}
								onClick={() => handleGradientPresetClick(preset)}
								title={preset.name}
								aria-label={`Select ${preset.name} gradient`}
							/>
						))}
					</div>
				</div>
			)}

			{/* Main Color Input Row for Active Color / Stop */}
			<div className="color-picker-main-row">
				{/* Swatch Button that triggers native color picker */}
				<div
					className={`color-swatch-container ${isTransparent ? 'is-transparent' : ''}`}
					title={
						isTransparent
							? `Transparent (${label}) - Click to pick color`
							: isGradientMode
								? `Click to pick ${activeStop === 'start' ? 'Start' : 'End'} color`
								: `Click to pick color for ${label}`
					}
					onClick={() => !disabled && nativeColorInputRef.current?.click()}
				>
					<div
						className="color-swatch-preview"
						style={{
							backgroundColor: isGradientMode ? undefined : rgbaToCssString(activeRgba),
							background: isGradientMode ? previewCssGradient : undefined
						}}
					/>
					{isTransparent && (
						<div className="color-swatch-transparent-badge" aria-hidden="true">
							<svg viewBox="0 0 24 24" width="100%" height="100%">
								<line
									x1="3"
									y1="21"
									x2="21"
									y2="3"
									stroke="#ef4444"
									strokeWidth="2.5"
									strokeLinecap="round"
								/>
							</svg>
						</div>
					)}
					<input
						ref={nativeColorInputRef}
						type="color"
						value={hex}
						onChange={handleNativeColorChange}
						disabled={disabled}
						className="color-swatch-native-input"
						aria-label={`Native color picker for ${label}`}
						tabIndex={-1}
					/>
				</div>

				{/* Hex text input */}
				<div className="color-hex-wrapper">
					<span className="color-hex-prefix" aria-hidden="true">
						#
					</span>
					<input
						type="text"
						value={hexDraft !== null ? hexDraft.replace(/^#/, '') : hex.replace(/^#/, '')}
						onChange={handleHexInputChange}
						onBlur={handleHexBlur}
						onKeyDown={handleHexKeyDown}
						disabled={disabled}
						maxLength={11}
						className="color-hex-input"
						aria-label={`Hex color code for ${label}`}
						placeholder={isTransparent ? 'TRANS' : undefined}
						spellCheck={false}
					/>
				</div>

				{/* Alpha % input if enabled */}
				{hasAlpha && (
					<div className="color-alpha-wrapper">
						<span className="color-alpha-label">A</span>
						<input
							type="number"
							min={0}
							max={100}
							step={1}
							value={alphaPercent}
							onChange={(e) => handleAlphaChange(Number(e.target.value) || 0)}
							disabled={disabled}
							className="color-alpha-input"
							aria-label={`Opacity percentage for ${label}`}
						/>
						<span className="color-alpha-unit">%</span>
					</div>
				)}

				{/* Toggle for RGBA detail view */}
				<button
					type="button"
					className={`color-channels-toggle ${showChannels ? 'is-active' : ''}`}
					onClick={() => setShowChannels(!showChannels)}
					title={showChannels ? 'Hide RGBA channels' : 'Show RGBA channels'}
					aria-label={showChannels ? 'Hide RGBA channel inputs' : 'Show RGBA channel inputs'}
				>
					<svg
						style={{
							transform: showChannels ? 'rotate(180deg)' : 'none',
							transition: 'transform 0.15s ease'
						}}
						width="10"
						height="10"
						viewBox="0 0 24 24"
						fill="none"
						stroke="currentColor"
						strokeWidth="2.5"
						strokeLinecap="round"
						strokeLinejoin="round"
					>
						<polyline points="6 9 12 15 18 9" />
					</svg>
				</button>
			</div>

			{/* Quick Preset Palette Swatches */}
			{showQuickPalette && (
				<div className="color-palette-row" aria-label="Preset color swatches">
					{canBeTransparent && (
						<>
							<button
								type="button"
								className={`color-transparent-chip ${isTransparent ? 'is-selected' : ''}`}
								onClick={handleSetTransparent}
								disabled={disabled}
								title="Transparent (Alpha 0)"
								aria-label={`Set ${label} to transparent`}
							>
								<span className="color-checker-box" aria-hidden="true">
									<svg viewBox="0 0 16 16" width="10" height="10">
										<line
											x1="2"
											y1="14"
											x2="14"
											y2="2"
											stroke="#ef4444"
											strokeWidth="2.2"
											strokeLinecap="round"
										/>
									</svg>
								</span>
								<span className="color-transparent-label">Transparent</span>
							</button>
							<div className="color-palette-divider" aria-hidden="true" />
						</>
					)}
					{PRESET_SWATCHES.map((swatch) => (
						<button
							key={swatch}
							type="button"
							className={`color-palette-swatch ${!isTransparent && hex.toUpperCase() === swatch ? 'is-selected' : ''}`}
							style={{ backgroundColor: swatch }}
							onClick={() => handlePresetClick(swatch)}
							disabled={disabled}
							title={swatch}
							aria-label={`Select ${swatch}`}
						/>
					))}
				</div>
			)}

			{/* Expandable RGBA Channel Sliders / Inputs */}
			{showChannels && (
				<div className="color-rgba-channels-grid">
					{(['R', 'G', 'B', 'A'] as const).map((channel, idx) => {
						const channelVal = idx === 0 ? r : idx === 1 ? g : idx === 2 ? b : a;
						return (
							<div key={channel} className="channel-field">
								<span className="channel-label">{channel}</span>
								<input
									type="number"
									min={0}
									max={1}
									step={0.01}
									value={Number(channelVal.toFixed(2))}
									onChange={(e) => handleChannelChange(idx, Number(e.target.value) || 0)}
									className="channel-input"
									aria-label={`${channel} channel for ${label}`}
								/>
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
