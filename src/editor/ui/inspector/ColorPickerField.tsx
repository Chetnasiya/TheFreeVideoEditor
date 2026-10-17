import { useState, useRef, useEffect } from 'react';
import { rgbToHex, hexToRgb, hexToRgba, clamp01 } from '../../core/colorMath';

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
		const parsed = hexToRgba(val);
		if (parsed) {
			return parsed;
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
	showRgbaChannels = false,
	allowTransparent = true
}: ColorPickerFieldProps) {
	const [r, g, b, a] = normalizeRgba(value);
	const hex = rgbToHex(r, g, b);
	const isTransparent = a < 0.005;
	const canBeTransparent = hasAlpha && allowTransparent;

	const [hexDraft, setHexDraft] = useState<string | null>(null);
	const [showChannels, setShowChannels] = useState(showRgbaChannels);
	const nativeColorInputRef = useRef<HTMLInputElement>(null);

	// Sync hexDraft when external value changes
	useEffect(() => {
		setHexDraft(null);
	}, [r, g, b, a]);

	const handleSetTransparent = () => {
		if (disabled || !canBeTransparent) return;
		onChange([r, g, b, 0], false);
	};

	const handleNativeColorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newHex = e.target.value;
		const parsed = hexToRgb(newHex);
		if (parsed) {
			const targetAlpha = isTransparent ? 1 : a;
			onChange([parsed[0], parsed[1], parsed[2], targetAlpha], false);
		}
	};

	const handleHexInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const inputVal = e.target.value;
		setHexDraft(inputVal);

		const clean = inputVal.trim().toLowerCase();
		if (clean === 'transparent' || clean === 'none') {
			if (canBeTransparent) {
				onChange([r, g, b, 0], true);
			}
			return;
		}

		const parsedRgba = hexToRgba(inputVal);
		if (parsedRgba) {
			const cleanNoHash = clean.replace(/^#/, '');
			if (cleanNoHash.length === 4 || cleanNoHash.length === 8) {
				onChange([parsedRgba[0], parsedRgba[1], parsedRgba[2], canBeTransparent ? parsedRgba[3] : 1], true);
			} else {
				const targetAlpha = isTransparent ? 1 : a;
				onChange([parsedRgba[0], parsedRgba[1], parsedRgba[2], targetAlpha], true);
			}
		}
	};

	const handleHexBlur = () => {
		if (hexDraft !== null) {
			const clean = hexDraft.trim().toLowerCase();
			if (clean === 'transparent' || clean === 'none') {
				if (canBeTransparent) {
					onChange([r, g, b, 0], false);
				}
				setHexDraft(null);
				return;
			}
			const parsedRgba = hexToRgba(hexDraft);
			if (parsedRgba) {
				const cleanNoHash = clean.replace(/^#/, '');
				if (cleanNoHash.length === 4 || cleanNoHash.length === 8) {
					onChange([parsedRgba[0], parsedRgba[1], parsedRgba[2], canBeTransparent ? parsedRgba[3] : 1], false);
				} else {
					const targetAlpha = isTransparent ? 1 : a;
					onChange([parsedRgba[0], parsedRgba[1], parsedRgba[2], targetAlpha], false);
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
		onChange([r, g, b, clampedAlpha], true);
	};

	const handlePresetClick = (presetHex: string) => {
		if (disabled) return;
		const parsed = hexToRgb(presetHex);
		if (parsed) {
			const targetAlpha = isTransparent ? 1 : a;
			onChange([parsed[0], parsed[1], parsed[2], targetAlpha], false);
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
					className={`color-swatch-container ${isTransparent ? 'is-transparent' : ''}`}
					title={
						isTransparent
							? `Transparent (${label}) - Click to pick color`
							: `Click to pick color for ${label}`
					}
					onClick={() => !disabled && nativeColorInputRef.current?.click()}
				>
					<div
						className="color-swatch-preview"
						style={{
							backgroundColor: `rgba(${Math.round(r * 255)}, ${Math.round(g * 255)}, ${Math.round(b * 255)}, ${a})`
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
