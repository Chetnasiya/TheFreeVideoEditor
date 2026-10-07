import { useState, type ChangeEvent } from 'react';
import type { Clip, Mask } from '../../core';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';

interface MasksSectionProps {
	clip: Clip;
	localTime: number;
	fps: number;
}

export default function MasksSection({ clip }: MasksSectionProps) {
	const store = useEditorStoreApi();
	const selectedMaskId = useEditorStore((state) => state.maskTool.selectedMaskId);
	const masks = clip.masks ?? [];
	const [expandedMaskId, setExpandedMaskId] = useState<string | null>(
		masks.length > 0 ? masks[0]!.id : null
	);

	const handleAddMask = (type: 'rect' | 'ellipse' | 'path') => {
		const newId = store.getState().addMask(clip.id, type);
		if (newId) {
			setExpandedMaskId(newId);
		}
	};

	const handleDeleteMask = (maskId: string) => {
		store.getState().removeMask(clip.id, maskId);
		if (expandedMaskId === maskId) {
			setExpandedMaskId(null);
		}
	};

	const handleToggleEnable = (mask: Mask) => {
		store.getState().updateMask(clip.id, mask.id, {
			enabled: mask.enabled === false ? true : false
		});
	};

	const handleToggleInvert = (mask: Mask) => {
		store.getState().updateMask(clip.id, mask.id, {
			inverted: !mask.inverted
		});
	};

	const handleModeChange = (mask: Mask, e: ChangeEvent<HTMLSelectElement>) => {
		store.getState().updateMask(clip.id, mask.id, {
			mode: e.target.value as 'add' | 'subtract' | 'intersect'
		});
	};

	const handleEffectLinkChange = (mask: Mask, e: ChangeEvent<HTMLSelectElement>) => {
		const effectId = e.target.value ? e.target.value : undefined;
		store.getState().updateMask(clip.id, mask.id, { effectId });
	};

	const handleParamChange = (mask: Mask, param: string, value: number, coalesce = false) => {
		store.getState().setMaskParam(clip.id, mask.id, param, value, { coalesce });
	};

	const handleReorder = (fromIdx: number, toIdx: number) => {
		store.getState().reorderMask(clip.id, fromIdx, toIdx);
	};

	return (
		<div className="masks-section">
			{/* Add mask button bar */}
			<div className="mask-add-bar" style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
				<button
					type="button"
					className="btn btn-sm btn-secondary"
					onClick={() => handleAddMask('rect')}
					title="Add rectangle mask"
					aria-label="Add rectangle mask"
				>
					+ Rectangle
				</button>
				<button
					type="button"
					className="btn btn-sm btn-secondary"
					onClick={() => handleAddMask('ellipse')}
					title="Add ellipse mask"
					aria-label="Add ellipse mask"
				>
					+ Ellipse
				</button>
				<button
					type="button"
					className="btn btn-sm btn-secondary"
					onClick={() => handleAddMask('path')}
					title="Add freeform bezier path mask"
					aria-label="Add path mask"
				>
					+ Path
				</button>
			</div>

			{masks.length === 0 ? (
				<p
					className="inspector-hint"
					style={{ margin: '8px 0', fontSize: '0.75rem', opacity: 0.7 }}
				>
					No masks on this clip. Click above to add a shape mask.
				</p>
			) : (
				<div className="mask-list" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
					{masks.map((mask, idx) => {
						const isExpanded = expandedMaskId === mask.id;
						const isSelected = selectedMaskId === mask.id;

						return (
							<div
								key={mask.id}
								className={`mask-card ${isSelected ? 'is-selected' : ''}`}
								style={{
									border: isSelected
										? '1px solid var(--color-accent, #6366f1)'
										: '1px solid rgba(255, 255, 255, 0.1)',
									borderRadius: 6,
									padding: 8,
									background: 'rgba(255, 255, 255, 0.03)'
								}}
							>
								{/* Card Header */}
								<div
									className="mask-card-header"
									style={{
										display: 'flex',
										alignItems: 'center',
										gap: 6,
										cursor: 'pointer',
										userSelect: 'none'
									}}
									onClick={() => {
										setExpandedMaskId(isExpanded ? null : mask.id);
										store.getState().selectMask(mask.id);
									}}
								>
									<span style={{ fontSize: '0.625rem', opacity: 0.6 }}>
										{isExpanded ? '▼' : '▶'}
									</span>
									<input
										type="checkbox"
										checked={mask.enabled !== false}
										onChange={(e) => {
											e.stopPropagation();
											handleToggleEnable(mask);
										}}
										aria-label={`Enable ${mask.name ?? mask.type}`}
										title="Toggle mask enabled"
										style={{ cursor: 'pointer' }}
									/>
									<span style={{ fontWeight: 500, fontSize: '0.8125rem', flex: 1 }}>
										{mask.name ?? `${mask.type.charAt(0).toUpperCase() + mask.type.slice(1)} Mask`}
									</span>
									<span
										className="badge"
										style={{
											fontSize: '0.625rem',
											padding: '2px 4px',
											background: 'rgba(255,255,255,0.08)',
											borderRadius: 4
										}}
									>
										{mask.type}
									</span>
									<button
										type="button"
										className="btn-icon"
										onClick={(e) => {
											e.stopPropagation();
											handleDeleteMask(mask.id);
										}}
										title="Delete mask"
										aria-label={`Delete mask ${mask.id}`}
										style={{
											background: 'none',
											border: 'none',
											color: 'inherit',
											opacity: 0.6,
											cursor: 'pointer'
										}}
									>
										✕
									</button>
								</div>

								{/* Card Content */}
								{isExpanded && (
									<div
										className="mask-card-body"
										style={{
											display: 'flex',
											flexDirection: 'column',
											gap: 8,
											marginTop: 8,
											paddingTop: 8,
											borderTop: '1px solid rgba(255,255,255,0.06)'
										}}
									>
										{/* Combine Mode & Invert */}
										<div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
											<label
												style={{
													fontSize: '0.75rem',
													display: 'flex',
													alignItems: 'center',
													gap: 4
												}}
											>
												Mode:
												<select
													value={mask.mode}
													onChange={(e) => handleModeChange(mask, e)}
													style={{
														background: 'rgba(0,0,0,0.3)',
														color: 'inherit',
														border: '1px solid rgba(255,255,255,0.15)',
														borderRadius: 4,
														fontSize: '0.75rem',
														padding: '2px 4px'
													}}
												>
													<option value="add">Add</option>
													<option value="subtract">Subtract</option>
													<option value="intersect">Intersect</option>
												</select>
											</label>

											<label
												style={{
													fontSize: '0.75rem',
													display: 'flex',
													alignItems: 'center',
													gap: 4,
													cursor: 'pointer'
												}}
											>
												<input
													type="checkbox"
													checked={mask.inverted}
													onChange={() => handleToggleInvert(mask)}
												/>
												Inverted
											</label>
										</div>

										{/* Effect Link */}
										{clip.effects && clip.effects.length > 0 && (
											<div
												style={{
													display: 'flex',
													alignItems: 'center',
													gap: 6,
													fontSize: '0.75rem'
												}}
											>
												<span>Apply to:</span>
												<select
													value={mask.effectId ?? ''}
													onChange={(e) => handleEffectLinkChange(mask, e)}
													style={{
														background: 'rgba(0,0,0,0.3)',
														color: 'inherit',
														border: '1px solid rgba(255,255,255,0.15)',
														borderRadius: 4,
														fontSize: '0.75rem',
														padding: '2px 4px',
														flex: 1
													}}
												>
													<option value="">Full Clip Alpha</option>
													{clip.effects.map((eff) => (
														<option key={eff.id} value={eff.id}>
															Effect: {eff.type}
														</option>
													))}
												</select>
											</div>
										)}

										{/* Feather */}
										<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
											<div
												style={{
													display: 'flex',
													justifyContent: 'space-between',
													fontSize: '0.75rem'
												}}
											>
												<span>Feather</span>
												<span>{Math.round(mask.feather)} px</span>
											</div>
											<input
												type="range"
												min={0}
												max={200}
												step={1}
												value={mask.feather}
												onChange={(e) =>
													handleParamChange(mask, 'feather', Number(e.target.value), true)
												}
												onPointerUp={(e) =>
													handleParamChange(
														mask,
														'feather',
														Number((e.target as HTMLInputElement).value),
														false
													)
												}
											/>
										</div>

										{/* Expansion */}
										<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
											<div
												style={{
													display: 'flex',
													justifyContent: 'space-between',
													fontSize: '0.75rem'
												}}
											>
												<span>Expansion</span>
												<span>{Math.round(mask.expansion)} px</span>
											</div>
											<input
												type="range"
												min={-100}
												max={100}
												step={1}
												value={mask.expansion}
												onChange={(e) =>
													handleParamChange(mask, 'expansion', Number(e.target.value), true)
												}
												onPointerUp={(e) =>
													handleParamChange(
														mask,
														'expansion',
														Number((e.target as HTMLInputElement).value),
														false
													)
												}
											/>
										</div>

										{/* Opacity */}
										<div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
											<div
												style={{
													display: 'flex',
													justifyContent: 'space-between',
													fontSize: '0.75rem'
												}}
											>
												<span>Opacity</span>
												<span>{Math.round(mask.opacity * 100)}%</span>
											</div>
											<input
												type="range"
												min={0}
												max={1}
												step={0.01}
												value={mask.opacity}
												onChange={(e) =>
													handleParamChange(mask, 'opacity', Number(e.target.value), true)
												}
												onPointerUp={(e) =>
													handleParamChange(
														mask,
														'opacity',
														Number((e.target as HTMLInputElement).value),
														false
													)
												}
											/>
										</div>

										{/* Shape specific readouts / buttons */}
										{mask.type === 'path' && (
											<div
												style={{
													display: 'flex',
													justifyContent: 'space-between',
													alignItems: 'center',
													fontSize: '0.75rem'
												}}
											>
												<span style={{ opacity: 0.7 }}>
													{mask.points?.length ??
														(mask.shape ? Math.floor(mask.shape.length / 6) : 0)}{' '}
													points
												</span>
												<button
													type="button"
													className="btn btn-xs btn-secondary"
													onClick={() => {
														store.getState().updateMask(clip.id, mask.id, { closed: !mask.closed });
													}}
												>
													{mask.closed ? 'Open Path' : 'Close Path'}
												</button>
											</div>
										)}

										{/* Reorder buttons */}
										<div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
											<button
												type="button"
												className="btn btn-xs btn-ghost"
												disabled={idx === 0}
												onClick={() => handleReorder(idx, idx - 1)}
												title="Move mask up"
											>
												↑ Move Up
											</button>
											<button
												type="button"
												className="btn btn-xs btn-ghost"
												disabled={idx === masks.length - 1}
												onClick={() => handleReorder(idx, idx + 1)}
												title="Move mask down"
											>
												↓ Move Down
											</button>
										</div>
									</div>
								)}
							</div>
						);
					})}
				</div>
			)}
		</div>
	);
}
