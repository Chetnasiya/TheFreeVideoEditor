import { useState } from 'react';
import type { Clip, Time } from '../../core';
import { TEXT_TEMPLATE_PRESETS, TEXT_ANIMATION_PRESETS } from '../../core/text/presets';
import { useEditorStoreApi } from '../../state/EditorProvider';
import { PropertyRow, type ConfirmDisableState } from './Inspector';
import { BUNDLED_FONTS } from '../../services/render/text/fontLoader';

interface TextSectionProps {
	clip: Clip;
	localTime: Time;
	fps: number;
	confirmDisable: ConfirmDisableState | null;
	onStartDisableConfirm: (state: ConfirmDisableState) => void;
	onCancelDisableConfirm: () => void;
}

export function TextSection({
	clip,
	localTime,
	fps,
	confirmDisable,
	onStartDisableConfirm,
	onCancelDisableConfirm
}: TextSectionProps) {
	const store = useEditorStoreApi();
	const textSource = clip.source?.type === 'text' ? clip.source : null;
	const textStyle = textSource?.style ?? { fontFamily: 'sans-serif', alignment: 'center' };
	const textBox = textSource?.box;

	const [fontSearch, setFontSearch] = useState('');
	const [fontPickerOpen, setFontPickerOpen] = useState(false);

	if (!textSource) return null;

	const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		store.getState().setTextContent(clip.id, e.target.value);
	};

	const handleTemplateSelect = (templateId: string) => {
		store.getState().applyTextTemplate(clip.id, templateId);
	};

	const handleAnimationSelect = (presetId: string) => {
		store.getState().applyTextAnimation(clip.id, presetId);
	};

	const handleClearAnimations = () => {
		store.getState().clearTextAnimations(clip.id);
	};

	const handleFontSelect = (family: string) => {
		store.getState().setTextStyle(clip.id, { fontFamily: family });
		setFontPickerOpen(false);
	};

	const handleAlignmentChange = (alignment: 'left' | 'center' | 'right') => {
		store.getState().setTextStyle(clip.id, { alignment });
	};

	const handleWeightChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		store.getState().setTextStyle(clip.id, {
			fontWeight: e.target.value as
				'normal' | 'bold' | '100' | '200' | '300' | '400' | '500' | '600' | '700' | '800' | '900'
		});
	};

	const handleStyleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
		store.getState().setTextStyle(clip.id, {
			fontStyle: e.target.value as 'normal' | 'italic'
		});
	};

	const handleBoxModeChange = (mode: 'auto' | 'fixed') => {
		if (mode === 'auto') {
			store.getState().setTextBox(clip.id, { autoSize: true });
		} else {
			store.getState().setTextBox(clip.id, { autoSize: false, width: textBox?.width ?? 600 });
		}
	};

	const handleBoxWidthChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const width = Math.max(20, Number(e.target.value) || 20);
		store.getState().setTextBox(clip.id, { width, autoSize: false });
	};

	const handleVerticalAnchorChange = (anchor: 'top' | 'center' | 'bottom') => {
		store.getState().setTextBox(clip.id, { verticalAnchor: anchor });
	};

	const filteredFonts = BUNDLED_FONTS.filter(
		(f) =>
			f.displayName.toLowerCase().includes(fontSearch.toLowerCase()) ||
			f.family.toLowerCase().includes(fontSearch.toLowerCase())
	);

	return (
		<div className="inspector-section-content">
			{/* Template Presets Picker */}
			<div className="property-row">
				<label className="property-label">Template</label>
				<select
					className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-canvas)] px-2 py-1 text-xs text-[var(--color-ink)]"
					onChange={(e) => {
						if (e.target.value) handleTemplateSelect(e.target.value);
					}}
					defaultValue=""
					aria-label="Apply text template preset"
				>
					<option value="" disabled>
						Apply Style Template…
					</option>
					{TEXT_TEMPLATE_PRESETS.map((t) => (
						<option key={t.id} value={t.id}>
							{t.name}
						</option>
					))}
				</select>
			</div>

			{/* Animation Presets */}
			<div className="property-row">
				<label className="property-label">Animation</label>
				<div className="flex w-full gap-1">
					<select
						className="flex-1 rounded border border-[var(--color-border-subtle)] bg-[var(--color-canvas)] px-2 py-1 text-xs text-[var(--color-ink)]"
						onChange={(e) => {
							if (e.target.value) handleAnimationSelect(e.target.value);
						}}
						defaultValue=""
						aria-label="Apply text animation preset"
					>
						<option value="" disabled>
							Apply Animation…
						</option>
						{TEXT_ANIMATION_PRESETS.map((a) => (
							<option key={a.id} value={a.id}>
								{a.name} ({a.kind})
							</option>
						))}
					</select>
					<button
						type="button"
						className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-canvas)] px-2 py-1 text-xs text-[var(--color-ink)] hover:bg-[var(--color-hairline)]"
						onClick={handleClearAnimations}
						title="Clear all animation keyframes on this text clip"
					>
						Clear
					</button>
				</div>
			</div>

			{/* Text Content */}
			<div className="property-row">
				<label className="property-label" htmlFor="text-content-input">
					Content
				</label>
				<textarea
					id="text-content-input"
					className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-canvas)] p-2 font-mono text-xs text-[var(--color-ink)] focus:border-[var(--color-link)] focus:outline-none"
					rows={3}
					value={textSource.text}
					onChange={handleContentChange}
					placeholder="Enter text..."
				/>
			</div>

			{/* Font Family Picker */}
			<div className="property-row">
				<label className="property-label">Font Family</label>
				<div className="relative w-full">
					<button
						type="button"
						className="flex w-full items-center justify-between rounded border border-[var(--color-border-subtle)] bg-[var(--color-canvas)] px-2 py-1 text-xs text-[var(--color-ink)]"
						onClick={() => setFontPickerOpen(!fontPickerOpen)}
						aria-label="Select font family"
					>
						<span>{textStyle.fontFamily || 'sans-serif'}</span>
						<span aria-hidden="true">▾</span>
					</button>

					{fontPickerOpen && (
						<div className="absolute top-full right-0 left-0 z-50 mt-1 max-h-48 overflow-y-auto rounded border border-[var(--color-hairline)] bg-[var(--color-canvas-elevated)] p-1 shadow-lg">
							<input
								type="text"
								className="mb-1 w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-canvas)] px-2 py-1 text-xs text-[var(--color-ink)] focus:outline-none"
								placeholder="Search fonts..."
								value={fontSearch}
								onChange={(e) => setFontSearch(e.target.value)}
								autoFocus
							/>
							<div className="flex flex-col gap-0.5">
								<button
									type="button"
									className="rounded px-2 py-1 text-left text-xs hover:bg-[var(--color-hairline)]"
									onClick={() => handleFontSelect('sans-serif')}
								>
									System Sans-Serif
								</button>
								<button
									type="button"
									className="rounded px-2 py-1 text-left text-xs hover:bg-[var(--color-hairline)]"
									onClick={() => handleFontSelect('monospace')}
								>
									System Monospace
								</button>
								{filteredFonts.map((font) => (
									<button
										key={font.family}
										type="button"
										className="flex items-center justify-between rounded px-2 py-1 text-left text-xs hover:bg-[var(--color-hairline)]"
										onClick={() => handleFontSelect(font.family)}
									>
										<span style={{ fontFamily: font.family }}>{font.displayName}</span>
										<span className="text-[10px] text-[var(--color-mute)]">{font.category}</span>
									</button>
								))}
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Font Weight & Style */}
			<div className="flex gap-2">
				<div className="flex-1">
					<label className="text-[11px] text-[var(--color-text-muted)]">Weight</label>
					<select
						className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-canvas)] px-2 py-1 text-xs text-[var(--color-ink)]"
						value={textStyle.fontWeight || 'normal'}
						onChange={handleWeightChange}
					>
						<option value="normal">Normal (400)</option>
						<option value="bold">Bold (700)</option>
						<option value="300">Light (300)</option>
						<option value="500">Medium (500)</option>
						<option value="600">Semi-Bold (600)</option>
						<option value="800">Extra-Bold (800)</option>
						<option value="900">Black (900)</option>
					</select>
				</div>
				<div className="flex-1">
					<label className="text-[11px] text-[var(--color-text-muted)]">Style</label>
					<select
						className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-canvas)] px-2 py-1 text-xs text-[var(--color-ink)]"
						value={textStyle.fontStyle || 'normal'}
						onChange={handleStyleChange}
					>
						<option value="normal">Normal</option>
						<option value="italic">Italic</option>
					</select>
				</div>
			</div>

			{/* Alignment */}
			<div className="property-row">
				<label className="property-label">Alignment</label>
				<div className="flex gap-1">
					{(['left', 'center', 'right'] as const).map((align) => (
						<button
							key={align}
							type="button"
							className={`flex-1 rounded px-2 py-1 text-xs capitalize ${
								(textStyle.alignment || 'center') === align
									? 'bg-[var(--color-link)] text-white'
									: 'border border-[var(--color-border-subtle)] bg-[var(--color-canvas)] text-[var(--color-ink)]'
							}`}
							onClick={() => handleAlignmentChange(align)}
						>
							{align}
						</button>
					))}
				</div>
			</div>

			{/* Box Sizing (Auto / Fixed Width) */}
			<div className="property-row">
				<label className="property-label">Box Mode</label>
				<div className="flex gap-1">
					<button
						type="button"
						className={`flex-1 rounded px-2 py-1 text-xs ${
							textBox?.autoSize !== false
								? 'bg-[var(--color-link)] text-white'
								: 'border border-[var(--color-border-subtle)] bg-[var(--color-canvas)] text-[var(--color-ink)]'
						}`}
						onClick={() => handleBoxModeChange('auto')}
					>
						Auto Size
					</button>
					<button
						type="button"
						className={`flex-1 rounded px-2 py-1 text-xs ${
							textBox?.autoSize === false
								? 'bg-[var(--color-link)] text-white'
								: 'border border-[var(--color-border-subtle)] bg-[var(--color-canvas)] text-[var(--color-ink)]'
						}`}
						onClick={() => handleBoxModeChange('fixed')}
					>
						Fixed Width
					</button>
				</div>
			</div>

			{textBox?.autoSize === false && (
				<div className="property-row">
					<label className="property-label">Width (px)</label>
					<input
						type="number"
						min="50"
						max="3840"
						className="w-full rounded border border-[var(--color-border-subtle)] bg-[var(--color-canvas)] px-2 py-1 text-xs text-[var(--color-ink)]"
						value={textBox?.width ?? 600}
						onChange={handleBoxWidthChange}
					/>
				</div>
			)}

			{/* Vertical Anchor */}
			<div className="property-row">
				<label className="property-label">Vertical Anchor</label>
				<div className="flex gap-1">
					{(['top', 'center', 'bottom'] as const).map((anchor) => (
						<button
							key={anchor}
							type="button"
							className={`flex-1 rounded px-2 py-1 text-xs capitalize ${
								(textBox?.verticalAnchor || 'center') === anchor
									? 'bg-[var(--color-link)] text-white'
									: 'border border-[var(--color-border-subtle)] bg-[var(--color-canvas)] text-[var(--color-ink)]'
							}`}
							onClick={() => handleVerticalAnchorChange(anchor)}
						>
							{anchor}
						</button>
					))}
				</div>
			</div>

			{/* Animatable Text Properties */}
			<div className="mt-3 flex flex-col gap-1 border-t border-[var(--color-border-subtle)] pt-2">
				<span className="text-[11px] font-medium text-[var(--color-text-secondary)]">
					Styling Properties
				</span>

				<PropertyRow
					clip={clip}
					propertyId="text.fontSize"
					localTime={localTime}
					fps={fps}
					confirmDisable={confirmDisable}
					onStartDisableConfirm={onStartDisableConfirm}
					onCancelDisableConfirm={onCancelDisableConfirm}
				/>

				<PropertyRow
					clip={clip}
					propertyId="text.fillColor"
					localTime={localTime}
					fps={fps}
					confirmDisable={confirmDisable}
					onStartDisableConfirm={onStartDisableConfirm}
					onCancelDisableConfirm={onCancelDisableConfirm}
				/>

				<PropertyRow
					clip={clip}
					propertyId="text.strokeColor"
					localTime={localTime}
					fps={fps}
					confirmDisable={confirmDisable}
					onStartDisableConfirm={onStartDisableConfirm}
					onCancelDisableConfirm={onCancelDisableConfirm}
				/>

				<PropertyRow
					clip={clip}
					propertyId="text.strokeWidth"
					localTime={localTime}
					fps={fps}
					confirmDisable={confirmDisable}
					onStartDisableConfirm={onStartDisableConfirm}
					onCancelDisableConfirm={onCancelDisableConfirm}
				/>

				<PropertyRow
					clip={clip}
					propertyId="text.letterSpacing"
					localTime={localTime}
					fps={fps}
					confirmDisable={confirmDisable}
					onStartDisableConfirm={onStartDisableConfirm}
					onCancelDisableConfirm={onCancelDisableConfirm}
				/>

				<PropertyRow
					clip={clip}
					propertyId="text.lineHeight"
					localTime={localTime}
					fps={fps}
					confirmDisable={confirmDisable}
					onStartDisableConfirm={onStartDisableConfirm}
					onCancelDisableConfirm={onCancelDisableConfirm}
				/>

				<PropertyRow
					clip={clip}
					propertyId="text.reveal"
					localTime={localTime}
					fps={fps}
					confirmDisable={confirmDisable}
					onStartDisableConfirm={onStartDisableConfirm}
					onCancelDisableConfirm={onCancelDisableConfirm}
				/>
			</div>
		</div>
	);
}
