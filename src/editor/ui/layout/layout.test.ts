import { describe, expect, it } from 'vitest';
import type { LayoutNode, LayoutSplitNode, LayoutStackNode, PanelId } from './types';
import {
	activateTab,
	collectPanels,
	createDefaultWorkspaceState,
	migrateOldPanelSizes,
	resizeSplit,
	resolveWorkspaceLayout,
	setPanelVisible,
	validateAndNormalizeLayout
} from './operations';
import { BUILT_IN_WORKSPACES, PRESET_EDITING } from './presets';

describe('Layout pure operations and normalization', () => {
	it('presets reference only registered panels and contain required panels', () => {
		for (const preset of BUILT_IN_WORKSPACES) {
			const panels = collectPanels(preset.layout);
			expect(panels).toContain('program');
			expect(panels).toContain('timeline');
			// No duplicate panels
			const unique = new Set(panels);
			expect(unique.size).toBe(panels.length);
		}
	});

	it('validateAndNormalizeLayout strips unknown panels and deduplicates', () => {
		const corruptLayout: LayoutNode = {
			type: 'split',
			direction: 'horizontal',
			sizes: [50, 50],
			children: [
				{
					type: 'stack',
					panelIds: ['program', 'unknown_panel' as PanelId, 'program'],
					activeId: 'program'
				},
				{
					type: 'stack',
					panelIds: ['timeline', 'inspector'],
					activeId: 'timeline'
				}
			]
		};

		const normalized = validateAndNormalizeLayout(corruptLayout);
		const panels = collectPanels(normalized);
		expect(panels).not.toContain('unknown_panel');
		expect(panels.filter((p) => p === 'program').length).toBe(1);
		expect(panels).toContain('timeline');
	});

	it('guarantees required panels (program and timeline) are injected if missing', () => {
		const missingReq: LayoutNode = {
			type: 'stack',
			panelIds: ['media', 'inspector'],
			activeId: 'media'
		};

		const normalized = validateAndNormalizeLayout(missingReq);
		const panels = collectPanels(normalized);
		expect(panels).toContain('program');
		expect(panels).toContain('timeline');
	});

	it('activates tab within a stack', () => {
		const layout: LayoutNode = {
			type: 'stack',
			panelIds: ['media', 'effects'],
			activeId: 'media'
		};

		const updated = activateTab(layout, 'effects');
		expect((updated as LayoutStackNode).activeId).toBe('effects');
	});

	it('shows and hides panel and prevents hiding required panels', () => {
		let layout = structuredClone(PRESET_EDITING.layout);

		// Attempt to hide required panel (program) is a no-op
		layout = setPanelVisible(layout, 'program', false);
		expect(collectPanels(layout)).toContain('program');

		// Hide captions
		layout = setPanelVisible(layout, 'captions', false);
		expect(collectPanels(layout)).not.toContain('captions');

		// Show captions back
		layout = setPanelVisible(layout, 'captions', true, 'media');
		expect(collectPanels(layout)).toContain('captions');
	});

	it('resizes split with minimum size clamping', () => {
		const split: LayoutSplitNode = {
			type: 'split',
			direction: 'horizontal',
			sizes: [50, 50],
			children: [
				{ type: 'stack', panelIds: ['program'], activeId: 'program' },
				{ type: 'stack', panelIds: ['timeline'], activeId: 'timeline' }
			]
		};

		// 1000px total width, resize by 100px
		const resized = resizeSplit(split, 0, 100, 1000, 200);
		expect(resized.sizes[0]).toBeCloseTo(60, 1);
		expect(resized.sizes[1]).toBeCloseTo(40, 1);

		// Clamp when dragging too far left (< 200px)
		const clamped = resizeSplit(split, 0, -400, 1000, 200);
		expect(clamped.sizes[0]).toBeCloseTo(20, 1); // 200px / 1000px = 20%
	});

	it('migrates old panel-size state into Editing layout', () => {
		const oldSizes = { mediaWidth: 300, inspectorWidth: 280, timelineHeight: 400 };
		const migrated = migrateOldPanelSizes(oldSizes, { width: 1440, height: 900 });
		const panels = collectPanels(migrated);
		expect(panels).toContain('media');
		expect(panels).toContain('program');
		expect(panels).toContain('timeline');
		expect(panels).toContain('inspector');
	});

	it('resolves custom and built-in workspace layouts with overrides', () => {
		const state = createDefaultWorkspaceState();
		const resolved = resolveWorkspaceLayout('editing', state);
		expect(resolved.workspace.name).toBe('Editing');

		// Apply override
		state.overrides['editing'] = {
			type: 'stack',
			panelIds: ['program', 'timeline'],
			activeId: 'program'
		};

		const withOverride = resolveWorkspaceLayout('editing', state);
		expect(collectPanels(withOverride.layout)).toEqual(['program', 'timeline']);
	});
});
