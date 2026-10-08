import { useState, useEffect } from 'react';
import type { Clip, Time } from '../../core';
import { useEditorStoreApi, useEditorStore } from '../../state/EditorProvider';
import { PropertyRow, type ConfirmDisableState } from './Inspector';

interface TextSectionProps {
	clip: Clip;
	localTime: Time;
	fps: number;
	confirmDisable: ConfirmDisableState | null;
	onStartDisableConfirm: (state: ConfirmDisableState) => void;
	onCancelDisableConfirm: () => void;
}

export default function TextSection({
	clip,
	localTime,
	fps,
	confirmDisable,
	onStartDisableConfirm,
	onCancelDisableConfirm
}: TextSectionProps) {
	const store = useEditorStoreApi();
	const [expandedPresets, setExpandedPresets] = useState(false);

	if (!clip.source || clip.source.type !== 'text') {
		return null;
	}

	const textSource = clip.source;
	const textStyle = textSource.style || { fontFamily: 'sans-serif' };
	const textBox = textSource.box || { width: 400 };

	const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
		store.getState().setTextContent(clip.id, e.target.value);
	};

	const handleFontFamilyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const newStyle = { ...textStyle, fontFamily: e.target.value };
		// Update via clip modification
		store.getState().mutateProject(
			'Update text font family',
			(proj) => ({
				...proj,
				tracks: proj.tracks.map((track) => ({
					...track,
					clips: track.clips.map((c) =>
						c.id === clip.id && c.source?.type === 'text'
							? {
									...c,
									source: {
										...c.source,
										style: newStyle
									}
								}
							: c
					)
				}))
			}),
			{ history: 'record' }
		);
	};

	const handleAlignmentChange = (alignment: 'left' | 'center' | 'right') => {
		const newStyle = { ...textStyle, alignment };
		store.getState().mutateProject(
			'Update text alignment',
			(proj) => ({
				...proj,
				tracks: proj.tracks.map((track) => ({
					...track,
					clips: track.clips.map((c) =>
						c.id === clip.id && c.source?.type === 'text'
							? {
									...c,
									source: {
										...c.source,
										style: newStyle
									}
								}
							: c
					)
				}))
			}),
			{ history: 'record' }
		);
	};

	const applyPreset = (presetName: string) => {
		const presetMap: Record<string, 'fade-in' | 'fade-out' | 'slide-up' | 'slide-down' | 'slide-left' | 'slide-right' | 'pop-in' | 'pop-out' | 'typewriter-in' | 'typewriter-out'> = {
			'Fade In': 'fade-in',
			'Fade Out': 'fade-out',
			'Slide Up': 'slide-up',
			'Slide Down': 'slide-down',
			'Slide Left': 'slide-left',
			'Slide Right': 'slide-right',
			'Pop In': 'pop-in',
			'Pop Out': 'pop-out',
			'Typewriter In': 'typewriter-in',
			'Typewriter Out': 'typewriter-out'
		};
		const preset = presetMap[presetName];
		if (preset) {
			store.getState().applyTextAnimationPreset(clip.id, preset);
		}
	};

	return (
		<div className="properties-section">
			<h3>Text</h3>

			<div className="form-group">
				<label>Content</label>
				<textarea
					value={textSource.text || ''}
					onChange={handleTextChange}
					placeholder="Enter text..."
					rows={3}
					style={{ width: '100%', fontFamily: 'monospace', fontSize: '12px' }}
				/>
			</div>

			<div className="form-group">
				<label>Font Family</label>
				<input
					type="text"
					value={textStyle.fontFamily || 'sans-serif'}
					onChange={handleFontFamilyChange}
					placeholder="e.g., Arial, sans-serif"
				/>
			</div>

			<div className="form-group">
				<label>Alignment</label>
				<div style={{ display: 'flex', gap: '8px' }}>
					{(['left', 'center', 'right'] as const).map((align) => (
						<button
							key={align}
							onClick={() => handleAlignmentChange(align)}
							style={{
								flex: 1,
								padding: '6px',
								backgroundColor:
									textStyle.alignment === align
										? 'var(--accent-color)'
										: 'var(--bg-secondary)',
								border: 'none',
								borderRadius: '4px',
								cursor: 'pointer',
								color: 'inherit',
								textTransform: 'capitalize'
							}}
						>
							{align}
						</button>
					))}
				</div>
			</div>

			<div className="form-group">
				<label>
					<input
						type="checkbox"
						checked={expandedPresets}
						onChange={(e) => setExpandedPresets(e.target.checked)}
					/>
					Animation Presets
				</label>
				{expandedPresets && (
					<div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px', marginTop: '8px' }}>
						{[
							'Fade In',
							'Fade Out',
							'Slide Up',
							'Slide Down',
							'Slide Left',
							'Slide Right',
							'Pop In',
							'Pop Out',
							'Typewriter In',
							'Typewriter Out'
						].map((preset) => (
							<button
								key={preset}
								onClick={() => applyPreset(preset)}
								style={{
									padding: '6px 12px',
									backgroundColor: 'var(--bg-secondary)',
									border: '1px solid var(--border-color)',
									borderRadius: '4px',
									cursor: 'pointer',
									color: 'inherit',
									fontSize: '12px'
								}}
							>
								{preset}
							</button>
						))}
					</div>
				)}
			</div>

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
				propertyId="text.strokeWidth"
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
	);
}
