import { useState, useMemo, type DragEvent } from 'react';
import { EFFECT_DEFINITIONS } from '../../core/effects/registry';
import type { EffectCategory, EffectDefinition } from '../../core/effects/types';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import './effects.css';

const CATEGORIES: Array<{ id: 'all' | EffectCategory; label: string }> = [
	{ id: 'all', label: 'All' },
	{ id: 'blur', label: 'Blur' },
	{ id: 'color', label: 'Color' },
	{ id: 'stylize', label: 'Stylize' },
	{ id: 'keying', label: 'Keying' },
	{ id: 'distort', label: 'Distort' }
];

export default function EffectsLibrary() {
	const store = useEditorStoreApi();
	const query = useEditorStore((state) => state.effectsUi.libraryQuery);
	const selectedClipIds = useEditorStore((state) => state.timeline.selection.clipIds);
	const [activeCategory, setActiveCategory] = useState<'all' | EffectCategory>('all');
	const [announcement, setAnnouncement] = useState('');

	const allEffects = useMemo(() => Object.values(EFFECT_DEFINITIONS), []);

	const filteredEffects = useMemo(() => {
		const lowerQuery = query.toLowerCase().trim();
		return allEffects.filter((def) => {
			if (activeCategory !== 'all' && def.category !== activeCategory) {
				return false;
			}
			if (!lowerQuery) return true;
			return (
				def.name.toLowerCase().includes(lowerQuery) ||
				(def.description?.toLowerCase().includes(lowerQuery) ?? false) ||
				def.category.toLowerCase().includes(lowerQuery)
			);
		});
	}, [allEffects, query, activeCategory]);

	const handleAddEffect = (def: EffectDefinition) => {
		if (selectedClipIds.length === 0) {
			setAnnouncement(`Select a clip in the timeline to apply ${def.name}.`);
			return;
		}
		const clipId = selectedClipIds[0]!;
		store.getState().addEffect(clipId, def.id as any);
		setAnnouncement(`Added ${def.name} to selected clip.`);
	};

	const handleDragStart = (e: DragEvent, def: EffectDefinition) => {
		e.dataTransfer.setData('application/x-tfve-effect', def.id);
		e.dataTransfer.setData('text/plain', def.id);
		e.dataTransfer.effectAllowed = 'copy';
	};

	return (
		<div className="effects-library" aria-label="Effects Library">
			<div className="effects-library-header">
				<input
					type="search"
					className="effects-search-input"
					placeholder="Search effects…"
					value={query}
					onChange={(e) => store.getState().setEffectsLibraryQuery(e.target.value)}
					aria-label="Search effects"
				/>
				<div className="effects-category-tabs" role="tablist" aria-label="Effect categories">
					{CATEGORIES.map((cat) => (
						<button
							key={cat.id}
							type="button"
							role="tab"
							aria-selected={activeCategory === cat.id}
							className={`effects-cat-btn ${activeCategory === cat.id ? 'is-active' : ''}`}
							onClick={() => setActiveCategory(cat.id)}
						>
							{cat.label}
						</button>
					))}
				</div>
			</div>

			<div className="effects-list" role="list">
				{filteredEffects.length === 0 ? (
					<div className="effects-empty">No effects found matching “{query}”.</div>
				) : (
					filteredEffects.map((def) => (
						<div
							key={def.id}
							className="effect-card"
							draggable
							onDragStart={(e) => handleDragStart(e, def)}
							onDoubleClick={() => handleAddEffect(def)}
							onKeyDown={(e) => {
								if (e.key === 'Enter') handleAddEffect(def);
							}}
							tabIndex={0}
							role="listitem"
							aria-label={`${def.name} effect, ${def.category}`}
						>
							<div className="effect-card-header">
								<span className="effect-card-title">{def.name}</span>
								<span className="effect-card-badge">{def.category}</span>
							</div>
							<p className="effect-card-desc">{def.description}</p>
							<button
								type="button"
								className="effect-card-add-btn"
								onClick={(e) => {
									e.stopPropagation();
									handleAddEffect(def);
								}}
							>
								Add to Clip
							</button>
						</div>
					))
				)}
			</div>

			<div className="sr-only" role="status" aria-live="polite">
				{announcement}
			</div>
		</div>
	);
}
