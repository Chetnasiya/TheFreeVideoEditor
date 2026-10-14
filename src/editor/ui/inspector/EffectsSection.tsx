import { useState, useEffect, type DragEvent as ReactDragEvent } from 'react';
import { EFFECT_DEFINITIONS } from '../../core/effects/registry';
import type { Clip, EffectInstance, Time } from '../../core';
import { useEditorStoreApi, useEditorStore } from '../../state/EditorProvider';
import { PropertyRow, type ConfirmDisableState } from './Inspector';
import { ColorPickerField } from './ColorPickerField';
import {
	BUILT_IN_PRESETS,
	listUserPresets,
	saveUserPreset,
	deleteUserPreset,
	type EffectPreset
} from '../../services/storage/presets';

interface EffectsSectionProps {
	clip: Clip;
	localTime: Time;
	fps: number;
	confirmDisable: ConfirmDisableState | null;
	onStartDisableConfirm: (state: ConfirmDisableState) => void;
	onCancelDisableConfirm: () => void;
}

export default function EffectsSection({
	clip,
	localTime,
	fps,
	confirmDisable,
	onStartDisableConfirm,
	onCancelDisableConfirm
}: EffectsSectionProps) {
	const store = useEditorStoreApi();
	const clipboard = useEditorStore((state) => state.effectsClipboard);
	const [expandedEffects, setExpandedEffects] = useState<Record<string, boolean>>({});
	const [userPresets, setUserPresets] = useState<EffectPreset[]>([]);
	const [showAddMenu, setShowAddMenu] = useState(false);
	const [showPresetMenu, setShowPresetMenu] = useState(false);
	const [isDropTarget, setIsDropTarget] = useState(false);
	const [presetNameInput, setPresetNameInput] = useState('');
	const [savingPresetForEffectId, setSavingPresetForEffectId] = useState<string | null>(null);

	const effects = clip.effects ?? [];

	useEffect(() => {
		void listUserPresets()
			.then(setUserPresets)
			.catch(() => {});
	}, []);

	const toggleExpand = (id: string) => {
		setExpandedEffects((prev) => ({
			...prev,
			[id]: !prev[id]
		}));
	};

	const handleAddEffect = (effectType: string) => {
		store.getState().addEffect(clip.id, effectType);
		setShowAddMenu(false);
	};

	const handleApplyPreset = (preset: EffectPreset) => {
		store.getState().addEffect(clip.id, preset.effect.type, preset.effect.params);
		setShowPresetMenu(false);
	};

	const handleSavePreset = async (eff: EffectInstance) => {
		if (!presetNameInput.trim()) return;
		await saveUserPreset(presetNameInput.trim(), eff);
		setUserPresets(await listUserPresets());
		setSavingPresetForEffectId(null);
		setPresetNameInput('');
	};

	const handleDeleteUserPreset = async (id: string) => {
		await deleteUserPreset(id);
		setUserPresets(await listUserPresets());
	};

	const handleDrop = (e: ReactDragEvent<HTMLDivElement>) => {
		e.preventDefault();
		setIsDropTarget(false);
		const effectType = e.dataTransfer?.getData('application/x-tfve-effect');
		if (effectType && EFFECT_DEFINITIONS[effectType]) {
			store.getState().addEffect(clip.id, effectType);
		}
	};

	return (
		<div
			className={`effects-section-container ${isDropTarget ? 'is-drop-active' : ''}`}
			onDragOver={(e) => {
				e.preventDefault();
				setIsDropTarget(true);
			}}
			onDragLeave={() => setIsDropTarget(false)}
			onDrop={handleDrop}
		>
			<div className="effects-section-toolbar">
				<div className="effects-toolbar-left">
					<div className="effects-dropdown-wrapper">
						<button
							type="button"
							className="effects-btn-primary"
							onClick={() => setShowAddMenu((v) => !v)}
							aria-expanded={showAddMenu}
						>
							+ Add Effect
						</button>
						{showAddMenu && (
							<div className="effects-menu-dropdown" role="menu">
								{Object.values(EFFECT_DEFINITIONS).map((def) => (
									<button
										key={def.id}
										type="button"
										role="menuitem"
										className="effects-menu-item"
										onClick={() => handleAddEffect(def.id)}
									>
										<span>{def.name}</span>
										<span className="effects-menu-cat">{def.category}</span>
									</button>
								))}
							</div>
						)}
					</div>

					<div className="effects-dropdown-wrapper">
						<button
							type="button"
							className="effects-btn-secondary"
							onClick={() => setShowPresetMenu((v) => !v)}
							aria-expanded={showPresetMenu}
						>
							Presets
						</button>
						{showPresetMenu && (
							<div className="effects-menu-dropdown" role="menu">
								<div className="effects-menu-header">Built-in Presets</div>
								{BUILT_IN_PRESETS.map((p) => (
									<button
										key={p.id}
										type="button"
										role="menuitem"
										className="effects-menu-item"
										onClick={() => handleApplyPreset(p)}
									>
										{p.name}
									</button>
								))}
								{userPresets.length > 0 && (
									<>
										<div className="effects-menu-header">User Presets</div>
										{userPresets.map((p) => (
											<div key={p.id} className="effects-user-preset-item">
												<button
													type="button"
													role="menuitem"
													className="effects-menu-item"
													onClick={() => handleApplyPreset(p)}
												>
													{p.name}
												</button>
												<button
													type="button"
													className="effects-preset-del"
													title="Delete preset"
													onClick={(e) => {
														e.stopPropagation();
														void handleDeleteUserPreset(p.id);
													}}
												>
													×
												</button>
											</div>
										))}
									</>
								)}
							</div>
						)}
					</div>
				</div>

				<div className="effects-toolbar-right">
					<button
						type="button"
						className="effects-icon-btn"
						title="Copy effects"
						aria-label="Copy effects"
						disabled={effects.length === 0}
						onClick={() => store.getState().copyClipEffects(clip.id)}
					>
						📋
					</button>
					<button
						type="button"
						className="effects-icon-btn"
						title="Paste effects"
						aria-label="Paste effects"
						disabled={!clipboard || clipboard.length === 0}
						onClick={() => store.getState().pasteClipEffects(clip.id)}
					>
						📥
					</button>
				</div>
			</div>

			{effects.length === 0 ? (
				<div className="effects-empty-dropzone">
					No effects applied. Click “+ Add Effect” or drag an effect here.
				</div>
			) : (
				<div className="effects-stack">
					{effects.map((eff, index) => {
						const def = EFFECT_DEFINITIONS[eff.type];
						const isExpanded = expandedEffects[eff.id] !== false; // default open
						const isEnabled = eff.enabled !== false;

						return (
							<div key={eff.id} className={`effect-stack-item ${isEnabled ? '' : 'is-disabled'}`}>
								<div className="effect-item-header">
									<div className="effect-header-left">
										<input
											type="checkbox"
											checked={isEnabled}
											onChange={() => store.getState().toggleEffect(clip.id, eff.id)}
											aria-label={`Enable ${def?.name ?? eff.type}`}
										/>
										<button
											type="button"
											className="effect-expand-btn"
											onClick={() => toggleExpand(eff.id)}
											aria-expanded={isExpanded}
											title={isExpanded ? 'Collapse' : 'Expand'}
										>
											<svg
												className="section-chevron"
												style={{
													transform: isExpanded ? 'rotate(90deg)' : 'none',
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
												aria-hidden="true"
											>
												<polyline points="9 18 15 12 9 6" />
											</svg>
										</button>
										<span className="effect-title">{def?.name ?? eff.type}</span>
									</div>

									<div className="effect-header-actions">
										<button
											type="button"
											className="effects-action-btn"
											title="Move up"
											disabled={index === 0}
											onClick={() => store.getState().reorderEffect(clip.id, eff.id, index - 1)}
										>
											<svg
												width="10"
												height="10"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2.5"
												strokeLinecap="round"
												strokeLinejoin="round"
											>
												<polyline points="18 15 12 9 6 15" />
											</svg>
										</button>
										<button
											type="button"
											className="effects-action-btn"
											title="Move down"
											disabled={index === effects.length - 1}
											onClick={() => store.getState().reorderEffect(clip.id, eff.id, index + 1)}
										>
											<svg
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
										<button
											type="button"
											className="effects-action-btn"
											title="Duplicate effect"
											onClick={() => store.getState().duplicateEffect(clip.id, eff.id)}
										>
											<svg
												width="11"
												height="11"
												viewBox="0 0 24 24"
												fill="none"
												stroke="currentColor"
												strokeWidth="2"
												strokeLinecap="round"
												strokeLinejoin="round"
											>
												<rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
												<path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
											</svg>
										</button>
										<button
											type="button"
											className="effects-action-btn"
											title="Reset effect to defaults"
											onClick={() => store.getState().resetEffect(clip.id, eff.id)}
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
											>
												<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />
												<polyline points="3 3 3 8 8 8" />
											</svg>
										</button>
										<button
											type="button"
											className="effects-action-btn is-danger"
											title="Delete effect"
											onClick={() => store.getState().removeEffect(clip.id, eff.id)}
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
											>
												<line x1="18" y1="6" x2="6" y2="18" />
												<line x1="6" y1="6" x2="18" y2="18" />
											</svg>
										</button>
									</div>
								</div>

								{isExpanded && (
									<div className="effect-item-body">
										{/* Universal Mix slider */}
										<PropertyRow
											clip={clip}
											propertyId={`effect:${eff.type}:${eff.id}:mix`}
											localTime={localTime}
											fps={fps}
											confirmDisable={confirmDisable}
											onStartDisableConfirm={onStartDisableConfirm}
											onCancelDisableConfirm={onCancelDisableConfirm}
										/>

										{/* Parameter controls */}
										{def &&
											Object.entries(def.params).map(([paramName, paramSchema]) => {
												if (paramName === 'mix') return null;
												const propId = `effect:${eff.type}:${eff.id}:${paramName}`;

												if (paramSchema.type === 'color') {
													const colorVal = eff.params[paramName] as
														| [number, number, number]
														| [number, number, number, number]
														| string
														| undefined;
													return (
														<div key={propId} className="effect-custom-param-row">
															<span className="property-label">{paramSchema.label}</span>
															<ColorPickerField
																value={colorVal ?? [0, 1, 0]}
																hasAlpha={false}
																label={paramSchema.label}
																onChange={(rgba) => {
																	store
																		.getState()
																		.setEffectParam(clip.id, eff.id, paramName, [
																			rgba[0],
																			rgba[1],
																			rgba[2]
																		]);
																}}
															/>
														</div>
													);
												}

												if (paramSchema.animatable) {
													return (
														<PropertyRow
															key={propId}
															clip={clip}
															propertyId={propId}
															localTime={localTime}
															fps={fps}
															confirmDisable={confirmDisable}
															onStartDisableConfirm={onStartDisableConfirm}
															onCancelDisableConfirm={onCancelDisableConfirm}
														/>
													);
												}

												if (paramSchema.type === 'enum' && paramSchema.options) {
													const currentVal =
														(eff.params[paramName] as string) || paramSchema.defaultValue;
													return (
														<div key={propId} className="effect-custom-param-row">
															<span className="property-label">{paramSchema.label}</span>
															<select
																value={currentVal as string}
																onChange={(e) =>
																	store
																		.getState()
																		.setEffectParam(clip.id, eff.id, paramName, e.target.value)
																}
																className="effect-enum-select"
															>
																{paramSchema.options.map((opt) => (
																	<option key={opt.value} value={opt.value}>
																		{opt.label}
																	</option>
																))}
															</select>
														</div>
													);
												}

												if (paramSchema.type === 'boolean') {
													const currentVal = Boolean(
														eff.params[paramName] ?? paramSchema.defaultValue
													);
													return (
														<div key={propId} className="effect-custom-param-row">
															<label className="effect-bool-label">
																<input
																	type="checkbox"
																	checked={currentVal}
																	onChange={(e) =>
																		store
																			.getState()
																			.setEffectParam(clip.id, eff.id, paramName, e.target.checked)
																	}
																/>
																<span>{paramSchema.label}</span>
															</label>
														</div>
													);
												}

												return null;
											})}

										{/* Save preset inline dialog and Mask this effect */}
										<div
											className="effect-preset-save-bar"
											style={{ display: 'flex', gap: 6, alignItems: 'center' }}
										>
											{savingPresetForEffectId === eff.id ? (
												<div className="effect-save-preset-form">
													<input
														type="text"
														placeholder="Preset name…"
														value={presetNameInput}
														onChange={(e) => setPresetNameInput(e.target.value)}
														className="effect-preset-name-input"
													/>
													<button
														type="button"
														className="effects-btn-primary"
														onClick={() => void handleSavePreset(eff)}
													>
														Save
													</button>
													<button
														type="button"
														className="effects-btn-secondary"
														onClick={() => {
															setSavingPresetForEffectId(null);
															setPresetNameInput('');
														}}
													>
														Cancel
													</button>
												</div>
											) : (
												<>
													<button
														type="button"
														className="effect-save-preset-trigger"
														onClick={() => {
															setSavingPresetForEffectId(eff.id);
															setPresetNameInput(`${def?.name ?? eff.type} Preset`);
														}}
													>
														Save as Preset…
													</button>
													<button
														type="button"
														className="effect-save-preset-trigger"
														title="Create a shape mask targeting only this effect"
														onClick={() => {
															const maskId = store.getState().addMask(clip.id, 'rect', {
																name: `Mask (${def?.name ?? eff.type})`,
																effectId: eff.id
															});
															if (maskId) {
																store.getState().setInspectorExpanded('masks', true);
																store.getState().selectMask(maskId);
															}
														}}
													>
														Mask this effect
													</button>
												</>
											)}
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
