import { useCallback, type ChangeEvent } from 'react';
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

interface TransitionInspectorProps {
	transition: Transition;
	track: Track;
	project: Project;
}

export function TransitionInspector({ transition, track, project }: TransitionInspectorProps) {
	const store = useEditorStoreApi();
	const def = getTransitionDefinition(transition.type);

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
			store.getState().updateTransition(transition.id, { type: newType, params: {} });
		},
		[store, transition.id]
	);

	const handleAlignmentChange = useCallback(
		(e: ChangeEvent<HTMLSelectElement>) => {
			const newAlignment = e.target.value as TransitionAlignment;
			store.getState().updateTransition(transition.id, { alignment: newAlignment });
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

	return (
		<div className="inspector-container">
			<section className="inspector-section is-open">
				<div className="inspector-section-header">
					<span className="inspector-section-title">
						<span className="section-chevron">▼</span>
						Transition: {def?.name ?? transition.type}
					</span>
					<button
						type="button"
						className="tool-button"
						style={{ height: '22px', fontSize: '11px', padding: '0 6px' }}
						onClick={() => store.getState().removeTransition(transition.id)}
					>
						Delete
					</button>
				</div>
				<div className="inspector-section-content">
					<div className="property-row">
						<label className="property-label">Type</label>
						<select className="property-input" value={transition.type} onChange={handleTypeChange}>
							{Object.values(TRANSITION_DEFINITIONS).map((d) => (
								<option key={d.id} value={d.id}>
									{d.name}
								</option>
							))}
						</select>
					</div>

					<div className="property-row">
						<label className="property-label">Duration (seconds)</label>
						<input
							type="number"
							className="property-input"
							step="0.05"
							min="0.05"
							value={(transition.duration / 1_000_000).toFixed(2)}
							onChange={handleDurationChange}
						/>
					</div>

					<div className="property-row">
						<label className="property-label">Alignment</label>
						<select
							className="property-input"
							value={transition.alignment}
							onChange={handleAlignmentChange}
						>
							<option value="center">Center on Cut</option>
							<option value="start">Start at Cut</option>
							<option value="end">End at Cut</option>
						</select>
					</div>

					<div className="property-row">
						<label className="property-label">Easing</label>
						<select
							className="property-input"
							value={transition.easing ?? 'linear'}
							onChange={(e) =>
								store.getState().updateTransition(transition.id, {
									easing: e.target.value as Transition['easing']
								})
							}
						>
							<option value="linear">Linear</option>
							<option value="easeIn">Ease In</option>
							<option value="easeOut">Ease Out</option>
							<option value="easeInOut">Ease In Out</option>
						</select>
					</div>

					{track.kind === 'video' && (
						<div className="property-row" style={{ flexDirection: 'row', alignItems: 'center' }}>
							<input
								type="checkbox"
								id="transition-audio-crossfade"
								checked={transition.audioCrossfade !== false}
								onChange={(e) =>
									store
										.getState()
										.updateTransition(transition.id, { audioCrossfade: e.target.checked })
								}
							/>
							<label
								htmlFor="transition-audio-crossfade"
								className="property-label"
								style={{ cursor: 'pointer', margin: 0 }}
							>
								Crossfade Audio
							</label>
						</div>
					)}

					{/* Handles diagnostic warning */}
					{!isSufficient && (
						<div
							className="property-row"
							style={{
								padding: '6px 8px',
								background: 'rgba(239, 68, 68, 0.15)',
								border: '1px solid rgba(239, 68, 68, 0.4)',
								borderRadius: '4px',
								color: '#f87171',
								fontSize: '11px'
							}}
						>
							⚠️ Insufficient media handles! Frames beyond the cut may freeze or repeat.
						</div>
					)}

					{handles && (
						<div className="property-row" style={{ fontSize: '11px', color: 'var(--color-mute)' }}>
							<span>Outgoing handle: {(handles.handleA / 1_000_000).toFixed(2)}s</span>
							<span>Incoming handle: {(handles.handleB / 1_000_000).toFixed(2)}s</span>
						</div>
					)}

					{/* Transition parameters schema UI */}
					{def && Object.keys(def.params).length > 0 && (
						<div
							style={{
								marginTop: '8px',
								borderTop: '1px solid var(--color-hairline)',
								paddingTop: '8px'
							}}
						>
							<h4 style={{ margin: '0 0 6px 0', fontSize: '11px', color: 'var(--color-ink)' }}>
								Parameters
							</h4>
							{Object.entries(def.params).map(([paramName, schema]) => {
								const val = transition.params[paramName] ?? schema.defaultValue;
								if (schema.type === 'number') {
									return (
										<div className="property-row" key={paramName}>
											<label className="property-label">{schema.label}</label>
											<input
												type="range"
												min={schema.min}
												max={schema.max}
												step={schema.step}
												value={Number(val)}
												onChange={(e) => handleParamChange(paramName, parseFloat(e.target.value))}
											/>
											<span style={{ fontSize: '11px', textAlign: 'right' }}>{String(val)}</span>
										</div>
									);
								}
								if (schema.type === 'boolean') {
									return (
										<div
											className="property-row"
											key={paramName}
											style={{ flexDirection: 'row', alignItems: 'center' }}
										>
											<input
												type="checkbox"
												id={`param-${paramName}`}
												checked={Boolean(val)}
												onChange={(e) => handleParamChange(paramName, e.target.checked)}
											/>
											<label
												htmlFor={`param-${paramName}`}
												className="property-label"
												style={{ cursor: 'pointer' }}
											>
												{schema.label}
											</label>
										</div>
									);
								}
								if (schema.type === 'enum') {
									return (
										<div className="property-row" key={paramName}>
											<label className="property-label">{schema.label}</label>
											<select
												className="property-input"
												value={String(val)}
												onChange={(e) => handleParamChange(paramName, e.target.value)}
											>
												{schema.options?.map((opt: { label: string; value: string }) => (
													<option key={opt.value} value={opt.value}>
														{opt.label}
													</option>
												))}
											</select>
										</div>
									);
								}
								return null;
							})}
						</div>
					)}
				</div>
			</section>
		</div>
	);
}
