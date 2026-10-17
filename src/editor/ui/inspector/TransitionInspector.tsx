import { useCallback, useState, type ChangeEvent } from 'react';
import {
	getTransitionDefinition,
	availableHandles,
	checkHandlesSufficient,
	TRANSITION_DEFINITIONS,
	type Project,
	type Track,
	type Transition,
	type TransitionType,
	type TransitionAlignment
} from '../../core';
import { useEditorStoreApi } from '../../state/EditorProvider';
import { trackFeatureUsed } from '../../../services/activityTracking';

interface TransitionInspectorProps {
	transition: Transition;
	track: Track;
	project: Project;
}

function ChevronDownIcon() {
	return (
		<svg
			className="inspector-select-chevron"
			width="10"
			height="10"
			viewBox="0 0 24 24"
			fill="none"
			stroke="currentColor"
			strokeWidth="2.5"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<polyline points="6 9 12 15 18 9" />
		</svg>
	);
}

function SectionChevronIcon() {
	return (
		<svg
			className="section-chevron"
			width="11"
			height="11"
			viewBox="0 0 16 16"
			fill="none"
			stroke="currentColor"
			strokeWidth="2"
			strokeLinecap="round"
			strokeLinejoin="round"
			aria-hidden="true"
		>
			<path d="M6 3.5l4.5 4.5L6 12.5" />
		</svg>
	);
}

export function TransitionInspector({ transition, track, project }: TransitionInspectorProps) {
	const store = useEditorStoreApi();
	const def = getTransitionDefinition(transition.type);
	const [isTransitionExpanded, setIsTransitionExpanded] = useState(true);
	const [isParamsExpanded, setIsParamsExpanded] = useState(true);

	// Find adjacent clips for handle diagnostics
	const edge = transition.edge;
	const clipA =
		edge.kind === 'cut'
			? track.clips.find((c) => c.id === edge.fromClipId)
			: edge.kind === 'tail'
				? track.clips.find((c) => c.id === edge.clipId)
				: undefined;

	const clipB =
		edge.kind === 'cut'
			? track.clips.find((c) => c.id === edge.toClipId)
			: edge.kind === 'head'
				? track.clips.find((c) => c.id === edge.clipId)
				: undefined;

	const assetA = clipA?.assetId ? project.assets[clipA.assetId] : undefined;
	const assetB = clipB?.assetId ? project.assets[clipB.assetId] : undefined;

	const handles = clipA && clipB ? availableHandles(clipA, clipB, assetA, assetB, project) : null;

	const isSufficient = clipA
		? checkHandlesSufficient(transition, clipA, clipB, assetA, assetB)
		: true;

	const handleDurationChange = useCallback(
		(e: ChangeEvent<HTMLInputElement>) => {
			const seconds = parseFloat(e.target.value);
			if (!Number.isNaN(seconds) && seconds > 0) {
				const durationUs = Math.round(seconds * 1_000_000);
				store.getState().updateTransition(transition.id, { duration: durationUs });
			}
		},
		[store, transition.id]
	);

	const handleTypeChange = useCallback(
		(e: ChangeEvent<HTMLSelectElement>) => {
			const newType = e.target.value as TransitionType;
			trackFeatureUsed('transitions', { type: newType });
			store.getState().updateTransition(transition.id, { type: newType, params: {} });
		},
		[store, transition.id]
	);

	const handleAlignmentSelect = useCallback(
		(newAlignment: TransitionAlignment) => {
			store.getState().updateTransition(transition.id, { alignment: newAlignment });
		},
		[store, transition.id]
	);

	const handleEasingChange = useCallback(
		(e: ChangeEvent<HTMLSelectElement>) => {
			store.getState().updateTransition(transition.id, {
				easing: e.target.value as Transition['easing']
			});
		},
		[store, transition.id]
	);

	const handleParamChange = useCallback(
		(paramName: string, val: import('../../core/types').JsonValue) => {
			store.getState().updateTransition(transition.id, {
				params: {
					...transition.params,
					[paramName]: val
				}
			});
		},
		[store, transition.id, transition.params]
	);

	const durationSecStr = (transition.duration / 1_000_000).toFixed(2);
	const hasParams = def && Object.keys(def.params).length > 0;

	return (
		<div className="inspector-container">
			{/* Top Selected Item Banner (matches Clip Banner across editor) */}
			<div className="inspector-clip-banner">
				<div className="inspector-clip-title-row">
					<span className="inspector-clip-name" title={def?.name ?? transition.type}>
						{def?.name ?? transition.type}
					</span>
					<div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
						<span
							className="timeline-counter-badge"
							style={{ color: '#a855f7', borderColor: 'rgba(168, 85, 247, 0.35)' }}
						>
							<span
								className="timeline-badge-dot"
								style={{ background: '#a855f7', boxShadow: '0 0 6px rgba(168, 85, 247, 0.7)' }}
								aria-hidden="true"
							/>
							Transition
						</span>
						<button
							type="button"
							className="transition-banner-delete-btn"
							title="Delete Transition"
							onClick={() => store.getState().removeTransition(transition.id)}
						>
							<svg
								width="11"
								height="11"
								viewBox="0 0 24 24"
								fill="none"
								stroke="currentColor"
								strokeWidth="2.2"
								strokeLinecap="round"
								strokeLinejoin="round"
								aria-hidden="true"
							>
								<polyline points="3 6 5 6 21 6" />
								<path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />
								<line x1="10" y1="11" x2="10" y2="17" />
								<line x1="14" y1="11" x2="14" y2="17" />
							</svg>
							Delete
						</button>
					</div>
				</div>

				<div className="inspector-clip-badges">
					<span className="timeline-counter-badge">Track: {track.name}</span>
					<span className="timeline-counter-badge">{durationSecStr}s</span>
					<span className="timeline-counter-badge" style={{ textTransform: 'capitalize' }}>
						{transition.alignment}
					</span>
				</div>
			</div>

			{/* Transition Properties Section */}
			<section className={`inspector-section ${isTransitionExpanded ? 'is-open' : ''}`}>
				<button
					type="button"
					className="inspector-section-header"
					onClick={() => setIsTransitionExpanded((v) => !v)}
					aria-expanded={isTransitionExpanded}
				>
					<span className="inspector-section-title">
						<SectionChevronIcon />
						Transition Settings
					</span>
				</button>

				{isTransitionExpanded && (
					<div className="inspector-section-content">
						{/* Type Selector */}
						<div className="property-row">
							<label className="property-label">Type</label>
							<div className="inspector-select-wrapper">
								<select
									className="property-select"
									value={transition.type}
									onChange={handleTypeChange}
								>
									{Object.values(TRANSITION_DEFINITIONS).map((d) => (
										<option key={d.id} value={d.id}>
											{d.name}
										</option>
									))}
								</select>
								<ChevronDownIcon />
							</div>
						</div>

						{/* Duration Field with Pill layout */}
						<div className="property-row">
							<div className="property-header">
								<label className="property-label">Duration</label>
							</div>
							<div className="property-inputs-wrapper">
								<div className="channel-field">
									<span className="channel-label">DUR</span>
									<input
										type="number"
										className="channel-input"
										step="0.05"
										min="0.05"
										value={durationSecStr}
										onChange={handleDurationChange}
									/>
									<span className="channel-unit">s</span>
								</div>
							</div>
						</div>

						{/* Alignment Segmented Control */}
						<div className="property-row">
							<label className="property-label">Alignment</label>
							<div className="segmented-pill-group" role="group" aria-label="Transition Alignment">
								<button
									type="button"
									className={`segmented-pill-btn ${transition.alignment === 'start' ? 'is-active' : ''}`}
									onClick={() => handleAlignmentSelect('start')}
								>
									Start at Cut
								</button>
								<button
									type="button"
									className={`segmented-pill-btn ${transition.alignment === 'center' ? 'is-active' : ''}`}
									onClick={() => handleAlignmentSelect('center')}
								>
									Center
								</button>
								<button
									type="button"
									className={`segmented-pill-btn ${transition.alignment === 'end' ? 'is-active' : ''}`}
									onClick={() => handleAlignmentSelect('end')}
								>
									End at Cut
								</button>
							</div>
						</div>

						{/* Easing Selector */}
						<div className="property-row">
							<label className="property-label">Easing</label>
							<div className="inspector-select-wrapper">
								<select
									className="property-select"
									value={transition.easing ?? 'linear'}
									onChange={handleEasingChange}
								>
									<option value="linear">Linear</option>
									<option value="easeIn">Ease In</option>
									<option value="easeOut">Ease Out</option>
									<option value="easeInOut">Ease In Out</option>
								</select>
								<ChevronDownIcon />
							</div>
						</div>

						{/* Audio Crossfade Toggle */}
						{track.kind === 'video' && (
							<label className="transition-checkbox-row">
								<input
									type="checkbox"
									className="transition-checkbox-input"
									checked={transition.audioCrossfade !== false}
									onChange={(e) =>
										store
											.getState()
											.updateTransition(transition.id, { audioCrossfade: e.target.checked })
									}
								/>
								<span className="transition-checkbox-label">Crossfade Audio</span>
							</label>
						)}

						{/* Insufficient Handles Warning Badge */}
						{!isSufficient && (
							<div
								style={{
									display: 'flex',
									alignItems: 'flex-start',
									gap: '8px',
									padding: '8px 10px',
									background: 'rgba(239, 68, 68, 0.12)',
									border: '1px solid rgba(239, 68, 68, 0.35)',
									borderRadius: '6px',
									color: '#f87171',
									fontSize: '11px',
									lineHeight: '1.4'
								}}
							>
								<span style={{ fontSize: '12px', flexShrink: 0 }}>⚠️</span>
								<span>Insufficient media handles! Frames beyond the cut may freeze or hold.</span>
							</div>
						)}

						{/* Media Handles Card */}
						{handles && (
							<div className="inspector-handles-card">
								<div className="inspector-handles-header">
									<span className="inspector-handles-title">Available Media Handles</span>
								</div>
								<div className="inspector-handles-grid">
									<div className="inspector-handle-stat">
										<span className="inspector-handle-label">Outgoing (Head)</span>
										<span className="inspector-handle-val">
											{(handles.handleA / 1_000_000).toFixed(2)}s
										</span>
									</div>
									<div className="inspector-handle-stat">
										<span className="inspector-handle-label">Incoming (Tail)</span>
										<span className="inspector-handle-val">
											{(handles.handleB / 1_000_000).toFixed(2)}s
										</span>
									</div>
								</div>
							</div>
						)}
					</div>
				)}
			</section>

			{/* Transition Custom Parameters Section */}
			{hasParams && (
				<section className={`inspector-section ${isParamsExpanded ? 'is-open' : ''}`}>
					<button
						type="button"
						className="inspector-section-header"
						onClick={() => setIsParamsExpanded((v) => !v)}
						aria-expanded={isParamsExpanded}
					>
						<span className="inspector-section-title">
							<SectionChevronIcon />
							Parameters
						</span>
					</button>

					{isParamsExpanded && (
						<div className="inspector-section-content">
							{Object.entries(def.params).map(([paramName, schema]) => {
								const val = transition.params[paramName] ?? schema.defaultValue;
								if (schema.type === 'number') {
									return (
										<div className="property-row" key={paramName}>
											<div className="property-header">
												<label className="property-label">{schema.label}</label>
												<span
													style={{
														fontFamily: 'var(--font-mono)',
														fontSize: '10.5px',
														color: '#94a3b8'
													}}
												>
													{Number(val).toFixed(2)}
												</span>
											</div>
											<div className="transition-param-slider-row">
												<input
													type="range"
													className="transition-param-slider"
													min={schema.min}
													max={schema.max}
													step={schema.step}
													value={Number(val)}
													onChange={(e) => handleParamChange(paramName, parseFloat(e.target.value))}
												/>
											</div>
										</div>
									);
								}
								if (schema.type === 'boolean') {
									return (
										<label className="transition-checkbox-row" key={paramName}>
											<input
												type="checkbox"
												className="transition-checkbox-input"
												checked={Boolean(val)}
												onChange={(e) => handleParamChange(paramName, e.target.checked)}
											/>
											<span className="transition-checkbox-label">{schema.label}</span>
										</label>
									);
								}
								if (schema.type === 'enum') {
									return (
										<div className="property-row" key={paramName}>
											<label className="property-label">{schema.label}</label>
											<div className="inspector-select-wrapper">
												<select
													className="property-select"
													value={String(val)}
													onChange={(e) => handleParamChange(paramName, e.target.value)}
												>
													{schema.options?.map((opt: { label: string; value: string }) => (
														<option key={opt.value} value={opt.value}>
															{opt.label}
														</option>
													))}
												</select>
												<ChevronDownIcon />
											</div>
										</div>
									);
								}
								return null;
							})}
						</div>
					)}
				</section>
			)}
		</div>
	);
}
