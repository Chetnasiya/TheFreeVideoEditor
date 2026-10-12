import { useState, useRef, useEffect } from 'react';
import { rgbToHex, hexToRgb, clamp01 } from '../../core/colorMath';

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

function normalizeRgba(val: ColorPickerFieldProps['value']): [number, number, number, number] {
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
		const parsed = hexToRgb(val);
		if (parsed) {
			return [parsed[0], parsed[1], parsed[2], 1];
		}
	}
	return [1, 1, 1, 1];
}

export function ColorPickerField({
	value,
	onChange,
	label = 'Color',
	hasAlpha = true,
	disabled = false,
	showQuickPalette = true,
	showRgbaChannels = false
}: ColorPickerFieldProps) {
	const [r, g, b, a] = normalizeRgba(value);
	const hex = rgbToHex(r, g, b);

	const [hexDraft, setHexDraft] = useState<string | null>(null);
	const [showChannels, setShowChannels] = useState(showRgbaChannels);
	const nativeColorInputRef = useRef<HTMLInputElement>(null);

	// Sync hexDraft when external value changes
	useEffect(() => {
		setHexDraft(null);
	}, [r, g, b]);

	const handleNativeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newHex = e.target.value;
		const parsed = hexToRgb(newHex);
		if (parsed) {
			onChange([parsed[0], parsed[1], parsed[2], a], false);
		}
	};

	const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const inputVal = e.target.value;
		setHexDraft(inputVal);

		const parsed = hexToRgb(inputVal);
		if (parsed) {
			onChange([parsed[0], parsed[1], parsed[2], a], true);
		}
	};

	const handleHexBlur = () => {
		if (hexDraft !== null) {
			const parsed = hexToRgb(hexDraft);
			if (parsed) {
				onChange([parsed[0], parsed[1], parsed[2], a], false);
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
		onChange([r, g, b, clampedAlpha], true);
	};

	const handlePresetClick = (presetHex: string) => {
		const parsed = hexToRgb(presetHex);
		if (parsed) {
			onChange([parsed[0], parsed[1], parsed[2], a], false);
		}
	};

	const handleChannelChange = (channelIdx: number, val: number) => {
		const next: [number, number, number, number] = [r, g, b, a];
		next[channelIdx] = clamp01(val);
		onChange(next, true);
	};

	const alphaPercent = Math.round(a * 100);

	return (
		<div className="color-picker-field-root">
			{/* Main Row: Swatch + Native Picker, Hex Input, Alpha Input, Toggle */}
			<div className="color-picker-main-row">
				{/* Swatch Button that triggers native color picker */}
				<div
					className="color-swatch-container"
					title={`Click to pick color for ${label}`}
					onClick={() => !disabled && nativeColorInputRef.current?.click()}
				>
					<div
						className="color-swatch-preview"
						style={{
							backgroundColor: `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`
						}}
					/>
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
						maxLength={8}
						className="color-hex-input"
						aria-label={`Hex color code for ${label}`}
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
					{PRESET_SWATCHES.map((swatch) => (
						<button
							key={swatch}
							type="button"
							className={`color-palette-swatch ${hex.toUpperCase() === swatch ? 'is-selected' : ''}`}
							style={{ backgroundColor: swatch }}
							onClick={() => handlePresetClick(swatch)}
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
