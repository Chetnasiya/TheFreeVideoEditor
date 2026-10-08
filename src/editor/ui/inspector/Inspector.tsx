import {
	useCallback,
	useRef,
	useState,
	type ChangeEvent,
	type KeyboardEvent,
	type PointerEvent as ReactPointerEvent
} from 'react';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import {
	descriptorFor,
	hasKeyframeAt,
	isAnimated,
	nextKeyframeTime,
	prevKeyframeTime,
	propertyCurve,
	readProperty,
	snapLocalTime,
	type Clip,
	type PropertyDescriptor,
	type PropertyId,
	type PropertyValue,
	type Time
} from '../../core';
import EffectsSection from './EffectsSection';
import MasksSection from './MasksSection';
import TimeRemapSection from './TimeRemapSection';
import { TextSection } from './TextSection';
import { TransitionInspector } from './TransitionInspector';
import './inspector.css';

export interface ConfirmDisableState {
	propertyId: PropertyId;
	clipId: Clip['id'];
}

export default function Inspector() {
	const store = useEditorStoreApi();
	const project = useEditorStore((state) => state.project);
	const playhead = useEditorStore((state) => state.timeline.playhead);
	const selectedClipIds = useEditorStore((state) => state.timeline.selection.clipIds);
	const selectedTransitionId = useEditorStore((state) => state.timeline.selection.transitionId);
	const inspector = useEditorStore((state) => state.inspector);

	const [confirmDisable, setConfirmDisable] = useState<ConfirmDisableState | null>(null);

	// Find selected transition if any
	let selectedTransition: {
		transition: import('../../core/types').Transition;
		track: import('../../core/types').Track;
	} | null = null;
	if (project && selectedTransitionId) {
		for (const track of project.tracks) {
			const tr = (track.transitions ?? []).find((t) => t.id === selectedTransitionId);
			if (tr) {
				selectedTransition = { transition: tr, track };
				break;
			}
		}
	}

	// Find the single selected clip
	const selectedClip: Clip | null =
		project && selectedClipIds.length === 1
			? (project.tracks.flatMap((t) => t.clips).find((c) => c.id === selectedClipIds[0]) ?? null)
			: null;

	if (!project) {
		return (
			<div className="inspector-container">
				<div className="inspector-empty">
					<p className="inspector-hint">Open a project to view its properties.</p>
				</div>
			</div>
		);
	}

	if (selectedTransition) {
		return (
			<TransitionInspector
				transition={selectedTransition.transition}
				track={selectedTransition.track}
				project={project}
			/>
		);
	}

	if (selectedClipIds.length === 0) {
		return (
			<div className="inspector-container">
				<div className="inspector-empty">
					<p className="inspector-hint">Select a clip to edit properties.</p>
					<div className="properties-section">
						<h3>Sequence</h3>
						<dl className="sequence-details">
							<div>
								<dt>Frame size</dt>
								<dd>
									{project.settings.width} × {project.settings.height}
								</dd>
							</div>
							<div>
								<dt>Frame rate</dt>
								<dd>{project.settings.fps} fps</dd>
							</div>
							<div>
								<dt>Audio sample rate</dt>
								<dd>{project.settings.sampleRate.toLocaleString()} Hz</dd>
							</div>
						</dl>
					</div>
				</div>
			</div>
		);
	}

	if (selectedClipIds.length > 1 || !selectedClip) {
		return (
			<div className="inspector-container">
				<div className="inspector-multiselect">
					<h3>{selectedClipIds.length} clips selected</h3>
					<p className="inspector-hint">
						Multi-clip editing is not supported. Select a single clip to edit transform and crop
						properties.
					</p>
				</div>
			</div>
		);
	}

	const localTime = playhead - selectedClip.start;
	const isTransformExpanded = inspector.expanded.transform !== false;
	const isCropExpanded = Boolean(inspector.expanded.crop);

	const isAdjustment = selectedClip.source?.type === 'adjustment';
	const isSpeedExpanded = inspector.expanded.speed !== false;
	const isMasksExpanded = inspector.expanded.masks !== false;
	const isEffectsExpanded = inspector.expanded.effects !== false;
	const isAudioExpanded = inspector.expanded.audio !== false;

	const clipAsset = selectedClip.assetId ? project.assets[selectedClip.assetId] : undefined;
	const clipTrack = project.tracks.find((t) => t.clips.some((c) => c.id === selectedClip.id));
	const isText = selectedClip.source?.type === 'text';
	const isTextExpanded = inspector.expanded.text !== false;
	const hasAudio = !isText && (clipTrack?.kind === 'audio' || (clipAsset?.hasAudio ?? false));

	return (
		<div className="inspector-container">
			{/* Text Section */}
			{isText && (
				<section className={`inspector-section ${isTextExpanded ? 'is-open' : ''}`}>
					<button
						type="button"
						className="inspector-section-header"
						onClick={() => store.getState().setInspectorExpanded('text', !isTextExpanded)}
						aria-expanded={isTextExpanded}
					>
						<span className="inspector-section-title">
							<span className="section-chevron" aria-hidden="true">
								{isTextExpanded ? '▼' : '▶'}
							</span>
							Text
						</span>
					</button>
					{isTextExpanded && (
						<TextSection
							clip={selectedClip}
							localTime={localTime}
							fps={project.settings.fps}
							confirmDisable={confirmDisable}
							onStartDisableConfirm={setConfirmDisable}
							onCancelDisableConfirm={() => setConfirmDisable(null)}
						/>
					)}
				</section>
			)}

			{/* Transform Section */}
			<section className={`inspector-section ${isTransformExpanded ? 'is-open' : ''}`}>
				<button
					type="button"
					className="inspector-section-header"
					onClick={() => store.getState().setInspectorExpanded('transform', !isTransformExpanded)}
					aria-expanded={isTransformExpanded}
				>
					<span className="inspector-section-title">
						<span className="section-chevron" aria-hidden="true">
							{isTransformExpanded ? '▼' : '▶'}
						</span>
						Transform
					</span>
				</button>
				{isTransformExpanded && (
					<div className="inspector-section-content">
						<PropertyRow
							clip={selectedClip}
							propertyId="position"
							localTime={localTime}
							fps={project.settings.fps}
							confirmDisable={confirmDisable}
							onStartDisableConfirm={setConfirmDisable}
							onCancelDisableConfirm={() => setConfirmDisable(null)}
						/>
						<PropertyRow
							clip={selectedClip}
							propertyId="scale"
							localTime={localTime}
							fps={project.settings.fps}
							linkScale={inspector.linkScale}
							onToggleLinkScale={() => store.getState().setInspectorLinkScale(!inspector.linkScale)}
							confirmDisable={confirmDisable}
							onStartDisableConfirm={setConfirmDisable}
							onCancelDisableConfirm={() => setConfirmDisable(null)}
						/>
						<PropertyRow
							clip={selectedClip}
							propertyId="rotation"
							localTime={localTime}
							fps={project.settings.fps}
							confirmDisable={confirmDisable}
							onStartDisableConfirm={setConfirmDisable}
							onCancelDisableConfirm={() => setConfirmDisable(null)}
						/>
						<PropertyRow
							clip={selectedClip}
							propertyId="anchor"
							localTime={localTime}
							fps={project.settings.fps}
							confirmDisable={confirmDisable}
							onStartDisableConfirm={setConfirmDisable}
							onCancelDisableConfirm={() => setConfirmDisable(null)}
						/>
						<PropertyRow
							clip={selectedClip}
							propertyId="opacity"
							localTime={localTime}
							fps={project.settings.fps}
							confirmDisable={confirmDisable}
							onStartDisableConfirm={setConfirmDisable}
							onCancelDisableConfirm={() => setConfirmDisable(null)}
						/>
					</div>
				)}
			</section>

			{/* Audio Section (Volume dB, Pan, Fades) */}
			{hasAudio && (
				<section className={`inspector-section ${isAudioExpanded ? 'is-open' : ''}`}>
					<button
						type="button"
						className="inspector-section-header"
						onClick={() => store.getState().setInspectorExpanded('audio', !isAudioExpanded)}
						aria-expanded={isAudioExpanded}
					>
						<span className="inspector-section-title">
							<span className="section-chevron" aria-hidden="true">
								{isAudioExpanded ? '▼' : '▶'}
							</span>
							Audio
						</span>
					</button>
					{isAudioExpanded && (
						<div className="inspector-section-content">
							<PropertyRow
								clip={selectedClip}
								propertyId="audio.volume"
								localTime={localTime}
								fps={project.settings.fps}
								confirmDisable={confirmDisable}
								onStartDisableConfirm={setConfirmDisable}
								onCancelDisableConfirm={() => setConfirmDisable(null)}
							/>
							<PropertyRow
								clip={selectedClip}
								propertyId="audio.pan"
								localTime={localTime}
								fps={project.settings.fps}
								confirmDisable={confirmDisable}
								onStartDisableConfirm={setConfirmDisable}
								onCancelDisableConfirm={() => setConfirmDisable(null)}
							/>
							<div className="mt-2 flex flex-col gap-2 border-t border-[var(--color-border-subtle)] p-2 text-xs">
								<div className="font-medium text-[var(--color-text-secondary)]">Fades</div>
								<div className="flex items-center justify-between">
									<label className="text-[11px] text-[var(--color-text-muted)]">Fade In (s)</label>
									<input
										type="number"
										min="0"
										step="0.1"
										value={((selectedClip.fadeInUs ?? 0) / 1_000_000).toFixed(2)}
										onChange={(e) => {
											const sec = Math.max(0, parseFloat(e.target.value) || 0);
											store
												.getState()
												.setClipFade(selectedClip.id, { fadeInUs: Math.round(sec * 1_000_000) });
										}}
										className="w-16 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] px-1.5 py-0.5 text-right font-mono"
									/>
								</div>
								<div className="flex items-center justify-between">
									<label className="text-[11px] text-[var(--color-text-muted)]">Fade Out (s)</label>
									<input
										type="number"
										min="0"
										step="0.1"
										value={((selectedClip.fadeOutUs ?? 0) / 1_000_000).toFixed(2)}
										onChange={(e) => {
											const sec = Math.max(0, parseFloat(e.target.value) || 0);
											store
												.getState()
												.setClipFade(selectedClip.id, { fadeOutUs: Math.round(sec * 1_000_000) });
										}}
										className="w-16 rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] px-1.5 py-0.5 text-right font-mono"
									/>
								</div>
								<div className="flex items-center justify-between">
									<label className="text-[11px] text-[var(--color-text-muted)]">Curve</label>
									<select
										value={selectedClip.fadeCurve ?? 'equalPower'}
										onChange={(e) => {
											store.getState().setClipFade(selectedClip.id, {
												fadeCurve: e.target.value as 'equalPower' | 'linear'
											});
										}}
										className="rounded border border-[var(--color-border-subtle)] bg-[var(--color-surface-sunken)] px-1.5 py-0.5"
									>
										<option value="equalPower">Equal Power (sin)</option>
										<option value="linear">Linear</option>
									</select>
								</div>
							</div>
						</div>
					)}
				</section>
			)}

			{/* Crop Section (hidden on adjustment layers) */}
			{!isAdjustment && (
				<section className={`inspector-section ${isCropExpanded ? 'is-open' : ''}`}>
					<button
						type="button"
						className="inspector-section-header"
						onClick={() => store.getState().setInspectorExpanded('crop', !isCropExpanded)}
						aria-expanded={isCropExpanded}
					>
						<span className="inspector-section-title">
							<span className="section-chevron" aria-hidden="true">
								{isCropExpanded ? '▼' : '▶'}
							</span>
							Crop
						</span>
					</button>
					{isCropExpanded && (
						<div className="inspector-section-content">
							<PropertyRow
								clip={selectedClip}
								propertyId="crop"
								localTime={localTime}
								fps={project.settings.fps}
								confirmDisable={confirmDisable}
								onStartDisableConfirm={setConfirmDisable}
								onCancelDisableConfirm={() => setConfirmDisable(null)}
							/>
						</div>
					)}
				</section>
			)}

			{/* Time Remapping Section */}
			<section className={`inspector-section ${isSpeedExpanded ? 'is-open' : ''}`}>
				<button
					type="button"
					className="inspector-section-header"
					onClick={() => store.getState().setInspectorExpanded('speed', !isSpeedExpanded)}
					aria-expanded={isSpeedExpanded}
				>
					<span className="inspector-section-title">
						<span className="section-chevron" aria-hidden="true">
							{isSpeedExpanded ? '▼' : '▶'}
						</span>
						Speed & Time Remap
						{selectedClip.timeRemap && (
							<span className="section-badge" style={{ marginLeft: 6, fontSize: '0.6875rem' }}>
								(Curve)
							</span>
						)}
					</span>
				</button>
				{isSpeedExpanded && (
					<div className="inspector-section-content">
						<TimeRemapSection
							clip={selectedClip}
							localTime={localTime}
							fps={project.settings.fps}
							confirmDisable={confirmDisable}
							onStartDisableConfirm={setConfirmDisable}
							onCancelDisableConfirm={() => setConfirmDisable(null)}
						/>
					</div>
				)}
			</section>

			{/* Masks Section */}
			<section className={`inspector-section ${isMasksExpanded ? 'is-open' : ''}`}>
				<button
					type="button"
					className="inspector-section-header"
					onClick={() => store.getState().setInspectorExpanded('masks', !isMasksExpanded)}
					aria-expanded={isMasksExpanded}
				>
					<span className="inspector-section-title">
						<span className="section-chevron" aria-hidden="true">
							{isMasksExpanded ? '▼' : '▶'}
						</span>
						Masks
						{selectedClip.masks && selectedClip.masks.length > 0 && (
							<span className="section-badge" style={{ marginLeft: 6, fontSize: '0.6875rem' }}>
								({selectedClip.masks.length})
							</span>
						)}
					</span>
				</button>
				{isMasksExpanded && (
					<div className="inspector-section-content">
						<MasksSection
							clip={selectedClip}
							localTime={localTime}
							fps={project.settings.fps}
							confirmDisable={confirmDisable}
							onStartDisableConfirm={setConfirmDisable}
							onCancelDisableConfirm={() => setConfirmDisable(null)}
						/>
					</div>
				)}
			</section>

			{/* Effects Section */}
			<section className={`inspector-section ${isEffectsExpanded ? 'is-open' : ''}`}>
				<button
					type="button"
					className="inspector-section-header"
					onClick={() => store.getState().setInspectorExpanded('effects', !isEffectsExpanded)}
					aria-expanded={isEffectsExpanded}
				>
					<span className="inspector-section-title">
						<span className="section-chevron" aria-hidden="true">
							{isEffectsExpanded ? '▼' : '▶'}
						</span>
						Effects
						{selectedClip.effects && selectedClip.effects.length > 0 && (
							<span className="section-badge" style={{ marginLeft: 6, fontSize: '0.6875rem' }}>
								({selectedClip.effects.length})
							</span>
						)}
					</span>
				</button>
				{isEffectsExpanded && (
					<div className="inspector-section-content">
						<EffectsSection
							clip={selectedClip}
							localTime={localTime}
							fps={project.settings.fps}
							confirmDisable={confirmDisable}
							onStartDisableConfirm={setConfirmDisable}
							onCancelDisableConfirm={() => setConfirmDisable(null)}
						/>
					</div>
				)}
			</section>
		</div>
	);
}

interface PropertyRowProps {
	clip: Clip;
	propertyId: PropertyId;
	localTime: Time;
	fps: number;
	linkScale?: boolean;
	onToggleLinkScale?: () => void;
	confirmDisable: ConfirmDisableState | null;
	onStartDisableConfirm: (state: ConfirmDisableState) => void;
	onCancelDisableConfirm: () => void;
}

export function PropertyRow({
	clip,
	propertyId,
	localTime,
	fps,
	linkScale,
	onToggleLinkScale,
	confirmDisable,
	onStartDisableConfirm,
	onCancelDisableConfirm
}: PropertyRowProps) {
	const store = useEditorStoreApi();
	const desc = descriptorFor(propertyId);
	if (!desc) return null;

	const curve = propertyCurve(clip, propertyId);
	const animated = Boolean(curve && isAnimated(curve));
	const evaluatedValue = readProperty(clip, propertyId, localTime);
	const snappedTime = snapLocalTime(clip, localTime, fps);
	const hasKeyframe = hasKeyframeAt(clip, propertyId, snappedTime);
	const prevKey = animated ? prevKeyframeTime(clip, [propertyId], localTime) : null;
	const nextKey = animated ? nextKeyframeTime(clip, [propertyId], localTime) : null;

	const isConfirmingDisable =
		confirmDisable?.clipId === clip.id && confirmDisable?.propertyId === propertyId;

	const handleStopwatchClick = () => {
		if (!animated) {
			store.getState().enableAnimation(clip.id, propertyId);
		} else {
			const keyCount = curve && isAnimated(curve) ? curve.keyframes.length : 0;
			if (keyCount > 1) {
				onStartDisableConfirm({ clipId: clip.id, propertyId });
			} else {
				store.getState().disableAnimation(clip.id, propertyId, 'flatten-current');
			}
		}
	};

	const handleReset = () => {
		const defaultVal = desc.defaultValue;
		store.getState().setProperty(clip.id, propertyId, defaultVal, { autoKey: true });
	};

	// Determine if value is different from default
	const isDefault = Array.isArray(evaluatedValue)
		? (desc.defaultValue as number[]).every(
				(v, i) => Math.abs(v - (evaluatedValue as number[])[i]!) < 0.0001
			)
		: Math.abs((desc.defaultValue as number) - (evaluatedValue as number)) < 0.0001;

	return (
		<div className="property-row">
			<div className="property-header">
				<div className="property-meta">
					<button
						type="button"
						className={`property-stopwatch ${animated ? 'is-active' : ''}`}
						onClick={handleStopwatchClick}
						title={animated ? 'Disable animation' : 'Enable animation'}
						aria-label={`${animated ? 'Disable' : 'Enable'} animation for ${desc.label}`}
					>
						<svg
							width="12"
							height="12"
							viewBox="0 0 24 24"
							fill="none"
							stroke="currentColor"
							strokeWidth="2"
							strokeLinecap="round"
							strokeLinejoin="round"
						>
							<circle cx="12" cy="14" r="8" />
							<line x1="12" y1="2" x2="12" y2="6" />
							<line x1="12" y1="14" x2="15" y2="11" />
						</svg>
					</button>
					<span className="property-label" title={desc.label}>
						{desc.label}
					</span>
				</div>

				<div className="property-controls">
					{animated && (
						<div className="keyframe-nav">
							<button
								type="button"
								className="keyframe-nav-btn"
								disabled={prevKey === null}
								onClick={() => {
									if (prevKey !== null) store.getState().setPlayhead(clip.start + prevKey);
								}}
								title="Previous keyframe (J)"
								aria-label="Previous keyframe"
							>
								◀
							</button>
							<button
								type="button"
								className="keyframe-diamond-btn"
								onClick={() => store.getState().toggleKeyframe(clip.id, propertyId)}
								title={hasKeyframe ? 'Remove keyframe at playhead' : 'Add keyframe at playhead'}
								aria-label={hasKeyframe ? 'Remove keyframe' : 'Add keyframe'}
							>
								{hasKeyframe ? '◆' : '◇'}
							</button>
							<button
								type="button"
								className="keyframe-nav-btn"
								disabled={nextKey === null}
								onClick={() => {
									if (nextKey !== null) store.getState().setPlayhead(clip.start + nextKey);
								}}
								title="Next keyframe (K)"
								aria-label="Next keyframe"
							>
								▶
							</button>
						</div>
					)}
					{!isDefault && (
						<button
							type="button"
							className="property-reset"
							onClick={handleReset}
							title="Reset to default"
							aria-label={`Reset ${desc.label} to default`}
						>
							↺
						</button>
					)}
				</div>
			</div>

			{isConfirmingDisable && (
				<div className="disable-confirm-box">
					<span>Turn off animation? Existing keyframes will be removed.</span>
					<div className="disable-confirm-actions">
						<button
							type="button"
							className="disable-confirm-btn"
							onClick={() => {
								store.getState().disableAnimation(clip.id, propertyId, 'flatten-current');
								onCancelDisableConfirm();
							}}
						>
							Flatten
						</button>
						<button
							type="button"
							className="disable-confirm-btn is-danger"
							onClick={() => {
								store.getState().disableAnimation(clip.id, propertyId, 'discard');
								onCancelDisableConfirm();
							}}
						>
							Discard
						</button>
						<button type="button" className="disable-confirm-btn" onClick={onCancelDisableConfirm}>
							Cancel
						</button>
					</div>
				</div>
			)}

			<div className="property-inputs-wrapper">
				<div className="property-inputs">
					{desc.channels.map((channelLabel, channelIdx) => (
						<ChannelField
							key={channelLabel}
							clip={clip}
							desc={desc}
							channelIdx={channelIdx}
							channelLabel={channelLabel}
							evaluatedValue={evaluatedValue}
							linkScale={linkScale}
						/>
					))}
				</div>
				{propertyId === 'scale' && onToggleLinkScale && (
					<button
						type="button"
						className={`link-scale-btn ${linkScale ? 'is-linked' : ''}`}
						onClick={onToggleLinkScale}
						title={linkScale ? 'Scale linked (proportional)' : 'Scale unlinked'}
						aria-label={linkScale ? 'Unlink scale axes' : 'Link scale axes'}
					>
						{linkScale ? '🔗' : '🔓'}
					</button>
				)}
			</div>
		</div>
	);
}

interface ChannelFieldProps {
	clip: Clip;
	desc: PropertyDescriptor;
	channelIdx: number;
	channelLabel: string;
	evaluatedValue: PropertyValue;
	linkScale?: boolean;
}

function ChannelField({
	clip,
	desc,
	channelIdx,
	channelLabel,
	evaluatedValue,
	linkScale
}: ChannelFieldProps) {
	const store = useEditorStoreApi();

	const numericValue = Array.isArray(evaluatedValue)
		? (evaluatedValue[channelIdx] ?? 0)
		: evaluatedValue;

	// In display units:
	const displayVal = Number((numericValue * desc.displayFactor).toFixed(2));
	const [textDraft, setTextDraft] = useState<string | null>(null);
	const isDraggingRef = useRef(false);
	const startDragPos = useRef(0);
	const startDragVal = useRef(0);

	const commitValue = useCallback(
		(nextDisplayVal: number, coalesce: boolean) => {
			if (!Number.isFinite(nextDisplayVal)) return;
			const storedSingle = nextDisplayVal / desc.displayFactor;

			if (desc.shape === 'number') {
				store.getState().setProperty(clip.id, desc.id, storedSingle, {
					autoKey: true,
					coalesce
				});
			} else {
				const currentArr = Array.isArray(evaluatedValue)
					? [...evaluatedValue]
					: [evaluatedValue, evaluatedValue];
				const oldChannelVal = currentArr[channelIdx] ?? 1;
				currentArr[channelIdx] = storedSingle;

				// Linked scale handling:
				if (desc.id === 'scale' && linkScale) {
					const otherIdx = channelIdx === 0 ? 1 : 0;
					const oldOtherVal = currentArr[otherIdx] ?? 1;
					if (Math.abs(oldChannelVal) > 0.0001) {
						const ratio = oldOtherVal / oldChannelVal;
						currentArr[otherIdx] = storedSingle * ratio;
					} else {
						currentArr[otherIdx] = storedSingle;
					}
				}

				store.getState().setProperty(clip.id, desc.id, currentArr, {
					autoKey: true,
					editedChannel: channelIdx,
					coalesce
				});
			}
		},
		[clip.id, desc, channelIdx, evaluatedValue, linkScale, store]
	);

	const isCommittedRef = useRef(false);

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (e.key === 'Enter') {
			if (textDraft !== null) {
				const parsed = parseFloat(textDraft);
				isCommittedRef.current = true;
				setTextDraft(null);
				if (!Number.isNaN(parsed)) commitValue(parsed, false);
			}
			e.currentTarget.blur();
		} else if (e.key === 'Escape') {
			isCommittedRef.current = true;
			setTextDraft(null);
			e.currentTarget.blur();
		} else if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
			e.preventDefault();
			const multiplier = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
			const step = desc.step * multiplier * (e.key === 'ArrowUp' ? 1 : -1);
			const current = textDraft !== null ? parseFloat(textDraft) || displayVal : displayVal;
			const next = current + step;
			commitValue(next, false);
			setTextDraft(String(Number(next.toFixed(2))));
		}
	};

	const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
		isCommittedRef.current = false;
		setTextDraft(e.target.value);
	};

	const handleBlur = () => {
		if (isCommittedRef.current) {
			isCommittedRef.current = false;
			return;
		}
		if (textDraft !== null) {
			const parsed = parseFloat(textDraft);
			setTextDraft(null);
			if (!Number.isNaN(parsed)) commitValue(parsed, false);
		}
	};

	const handlePointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
		e.preventDefault();
		isDraggingRef.current = true;
		startDragPos.current = e.clientX;
		startDragVal.current = displayVal;
		(e.target as HTMLElement).setPointerCapture(e.pointerId);
	};

	const handlePointerMove = (e: ReactPointerEvent<HTMLSpanElement>) => {
		if (!isDraggingRef.current) return;
		const deltaPx = e.clientX - startDragPos.current;
		const multiplier = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
		const next = startDragVal.current + deltaPx * desc.step * 0.5 * multiplier;
		commitValue(next, true);
	};

	const handlePointerUp = (e: ReactPointerEvent<HTMLSpanElement>) => {
		if (!isDraggingRef.current) return;
		isDraggingRef.current = false;
		try {
			(e.target as HTMLElement).releasePointerCapture(e.pointerId);
		} catch {}
	};

	const valueToShow = textDraft !== null ? textDraft : String(displayVal);

	return (
		<div className="channel-field">
			<span
				className="channel-label"
				onPointerDown={handlePointerDown}
				onPointerMove={handlePointerMove}
				onPointerUp={handlePointerUp}
				title={`Drag to adjust ${channelLabel}`}
			>
				{channelLabel}
			</span>
			<input
				type="text"
				inputMode="decimal"
				className="channel-input"
				value={valueToShow}
				onChange={handleChange}
				onKeyDown={handleKeyDown}
				onBlur={handleBlur}
				aria-label={desc.shape === 'number' ? desc.label : `${desc.label} ${channelLabel}`}
			/>
			<span className="channel-unit">{desc.unit}</span>
		</div>
	);
}
