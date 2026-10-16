/**
 * Comprehensive Guide Registry for The Free Video Editor Tools
 *
 * Each tool entry contains detailed, user-friendly instructions, keyboard shortcuts,
 * pro tips, step-by-step workflows, FAQs, and a YouTube video tutorial link/ID.
 *
 * TO ADD YOUTUBE TUTORIALS IN THE FUTURE:
 * Simply populate `youtubeVideoId` (e.g. "dQw4w9WgXcQ") or `youtubeUrl`
 * (e.g. "https://www.youtube.com/watch?v=dQw4w9WgXcQ").
 * When null/empty, a polished "Video Tutorial Coming Soon" placeholder card is shown.
 */

export type GuideCategory =
	| 'timeline'
	| 'ai'
	| 'motion'
	| 'color'
	| 'audio'
	| 'graphics'
	| 'vfx'
	| 'export';

export interface GuideCategoryInfo {
	id: GuideCategory;
	label: string;
	description: string;
	badge: string;
}

export const GUIDE_CATEGORIES: Record<GuideCategory, GuideCategoryInfo> = {
	timeline: {
		id: 'timeline',
		label: 'Timeline & Cuts',
		description: 'Core non-linear editing tools for trimming, slicing, slipping, and multi-track arrangement.',
		badge: 'Core NLE'
	},
	ai: {
		id: 'ai',
		label: 'AI Magic Tools',
		description: 'On-device neural AI models for automated silence removal, speech-to-text, and auto-captioning.',
		badge: 'On-Device AI'
	},
	motion: {
		id: 'motion',
		label: 'Motion Tracking',
		description: 'Subpixel 2D point tracking, bezier curve easing, and fluid keyframe animation.',
		badge: 'Animation & Tracking'
	},
	color: {
		id: 'color',
		label: 'Color & Scopes',
		description: 'Industry-standard 3-way color wheels, Kelvin white balance, 3D LUTs, and real-time scopes.',
		badge: 'Color Science'
	},
	audio: {
		id: 'audio',
		label: 'Audio Mixer & EQ',
		description: 'Tactile console mixer, 4-band parametric EQ, dynamics compression, and auto ducking.',
		badge: 'Audio Studio'
	},
	graphics: {
		id: 'graphics',
		label: 'Titles & Typography',
		description: 'Direct typography with web fonts, animated lower-thirds, shape overlays, and bounding boxes.',
		badge: 'Motion Graphics'
	},
	vfx: {
		id: 'vfx',
		label: 'VFX & Transitions',
		description: 'Hardware-accelerated WebGL2 shaders, cinematic video transitions, and adjustment layers.',
		badge: 'GPU Shaders'
	},
	export: {
		id: 'export',
		label: 'Export & Interchange',
		description: 'Smart proxy workflows, 4K 60fps WebCodecs hardware export, and studio NLE interchange.',
		badge: 'Rendering & Pipeline'
	}
};

export interface GuideStep {
	stepNumber: number;
	title: string;
	description: string;
	shortcutBadge?: string;
	tip?: string;
}

export interface GuideShortcut {
	action: string;
	key: string;
	modifier?: 'Cmd/Ctrl' | 'Alt/Option' | 'Shift' | 'Shift+Alt' | 'Cmd/Ctrl+Shift';
	note?: string;
}

export interface GuideFaq {
	question: string;
	answer: string;
}

export interface ToolGuide {
	id: string; // URL slug, e.g. "selection-tool"
	title: string;
	subtitle: string;
	category: GuideCategory;
	categoryLabel: string;
	shortcut?: string;
	secondaryShortcut?: string;
	workspace: string;
	difficulty: 'Beginner' | 'Intermediate' | 'Advanced';
	icon: string;
	readingTimeMinutes: number;

	// YouTube Video integration
	youtubeVideoId: string | null;
	youtubeUrl?: string;

	overview: string;
	whenToUse: string[];
	anatomy: Array<{
		feature: string;
		explanation: string;
	}>;
	steps: GuideStep[];
	quickTips: string[];
	keyboardShortcuts: GuideShortcut[];
	faq: GuideFaq[];
	relatedTools: string[];
}

/**
 * Extracts a YouTube Video ID from either an ID string or various URL formats.
 * Returns null if not configured or invalid.
 */
export function extractYoutubeId(input: string | null | undefined): string | null {
	if (!input) return null;
	const trimmed = input.trim();
	if (!trimmed) return null;

	// If it's already an 11-char ID without URL syntax
	if (/^[a-zA-Z0-9_-]{11}$/.test(trimmed)) {
		return trimmed;
	}

	// Regex for youtu.be, youtube.com/watch?v=, youtube.com/embed/, youtube.com/v/, etc.
	const regex =
		/(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=)|youtu\.be\/|youtube-nocookie\.com\/embed\/)([a-zA-Z0-9_-]{11})/;
	const match = trimmed.match(regex);
	return match ? match[1] : null;
}

/**
 * Registry containing complete in-detail guides for all tools in The Free Video Editor.
 */
export const TOOL_GUIDES: ToolGuide[] = [
	{
		id: 'selection-tool',
		title: 'Selection Tool',
		subtitle: 'The primary pointer tool for selecting, moving, trimming, and arranging clips on the timeline.',
		category: 'timeline',
		categoryLabel: 'Timeline & Cuts',
		shortcut: 'V',
		workspace: 'Editing',
		difficulty: 'Beginner',
		icon: 'select',
		readingTimeMinutes: 4,
		youtubeVideoId: null, // Add YouTube ID here in future, e.g. 'dQw4w9WgXcQ'
		youtubeUrl: '',
		overview:
			'The Selection Tool (V) is the default pointer and command center of The Free Video Editor. It lets you select individual clips, marquee-select multiple media items across tracks, drag clips along the timeline, resize clip in/out boundaries with edge handles, and select edit points for transition application.',
		whenToUse: [
			'Moving clips across different audio or video tracks.',
			'Trimming heads or tails of clips without altering downstream timeline spacing.',
			'Marquee selecting multiple clips to reposition an entire scene.',
			'Inspecting clip properties in the Inspector panel by clicking on any clip.',
			'Selecting gaps between clips to delete or ripple delete them.'
		],
		anatomy: [
			{
				feature: 'Pointer Cursor',
				explanation: 'When hovering over the body of a clip, cursor is standard pointer for moving and clicking.'
			},
			{
				feature: 'Edge Trim Handles',
				explanation: 'Hovering near the left or right boundary changes the cursor to an edge-bracket trim handle.'
			},
			{
				feature: 'Selection Marquee',
				explanation: 'Clicking and dragging on an empty timeline area draws a rectangular selection box across multiple clips.'
			},
			{
				feature: 'Linked Selection',
				explanation: 'Clicking a video clip automatically selects its synchronized audio track so they move in lockstep.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Activate the Selection Tool',
				description:
					'Press V on your keyboard or click the Selection Tool icon at the very top of the vertical timeline toolbar.',
				shortcutBadge: 'V'
			},
			{
				stepNumber: 2,
				title: 'Select and Inspect Clips',
				description:
					'Click directly on any video, audio, title, or adjustment layer clip. The clip will highlight with an active border, and its parameters will load instantly in the Properties Inspector on the right.',
				tip: 'Hold Shift and click multiple clips to select non-adjacent items.'
			},
			{
				stepNumber: 3,
				title: 'Move Clips Horizontally or Vertically',
				description:
					'Click and hold the center of a clip, then drag it left or right along the timeline, or vertically onto a new track. The magnetic playhead and adjacent clips will provide snapping alignment guides.',
				shortcutBadge: 'Drag'
			},
			{
				stepNumber: 4,
				title: 'Trim Heads and Tails',
				description:
					'Move your mouse to the left or right edge of a clip until the cursor changes to a bracket cursor [ or ]. Click and drag inward to trim unwanted footage, or outward to restore trimmed frames.',
				tip: 'To trim while automatically pulling downstream clips forward, use the Ripple Edit Tool (B) instead.'
			},
			{
				stepNumber: 5,
				title: 'Duplicate Clips Instantly',
				description:
					'Hold the Alt/Option key while dragging any clip to instantly create a duplicate copy at the destination point.',
				shortcutBadge: 'Alt/Option + Drag'
			}
		],
		quickTips: [
			'Press Escape or click any blank area on the timeline to deselect all clips.',
			'Press S to toggle Magnetic Snapping on or off whenever you need freeform micro-positioning.',
			'Use the Up and Down arrow keys to jump the playhead instantly between cut points of selected clips.',
			'Double-clicking an audio clip opens its expanded waveform display in the timeline.'
		],
		keyboardShortcuts: [
			{ action: 'Activate Selection Tool', key: 'V' },
			{ action: 'Add/Remove Clip from Selection', key: 'Click', modifier: 'Shift' },
			{ action: 'Duplicate Clip to New Position', key: 'Drag', modifier: 'Alt/Option' },
			{ action: 'Deselect All Clips', key: 'Escape' },
			{ action: 'Toggle Magnetic Snapping', key: 'S' }
		],
		faq: [
			{
				question: 'How do I move video and audio independently?',
				answer:
					'Right-click the clip and choose "Unlink Audio & Video", or hold Alt/Option while clicking only the audio or video track to select and adjust it independently.'
			},
			{
				question: 'What happens when I trim a clip using the Selection Tool?',
				answer:
					'The clip duration changes, but adjacent clips stay in their current timeline positions, leaving an empty gap if you shorten the clip. To automatically close the gap, use the Ripple Edit Tool (B) or click the gap and press Shift+Delete.'
			},
			{
				question: 'Can I drag multiple clips onto different tracks simultaneously?',
				answer:
					'Yes. Marquee-select the clips or Shift-click them, then drag the group together horizontally or vertically across tracks.'
			}
		],
		relatedTools: ['razor-tool', 'ripple-edit-tool', 'track-select-tool', 'slip-tool']
	},
	{
		id: 'razor-tool',
		title: 'Razor Tool',
		subtitle: 'Make frame-accurate cuts and split clips into separate sections across any track.',
		category: 'timeline',
		categoryLabel: 'Timeline & Cuts',
		shortcut: 'C',
		workspace: 'Editing',
		difficulty: 'Beginner',
		icon: 'scissors',
		readingTimeMinutes: 4,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'The Razor Tool (C) gives you surgical precision to cut, split, and divide clips anywhere on the timeline. Whether you need to remove mistakes, insert b-roll over an interview, split an audio take, or apply different effects to different parts of a continuous shot, the Razor tool cuts with integer-microsecond frame accuracy.',
		whenToUse: [
			'Cutting out bad takes, stumbles, or coughs in recorded interviews.',
			'Splitting a single clip to apply a color grade or zoom effect to only one segment.',
			'Creating quick-cut montages synchronized to musical beats.',
			'Slicing across all tracks simultaneously to insert a new scene.',
			'Separating audio from a video section before applying an audio transition.'
		],
		anatomy: [
			{
				feature: 'Angled Razor Cursor',
				explanation: 'The cursor renders as an angled razor blade indicating the exact frame cut coordinate.'
			},
			{
				feature: 'Cut Guide Indicator',
				explanation: 'A vertical hairline aligns with the razor blade to preview where the cut will fall across the track.'
			},
			{
				feature: 'Track Lock Respect',
				explanation: 'Locked tracks (padlock icon) are protected from accidental slices even if clicked.'
			},
			{
				feature: 'Linked Audio Slicing',
				explanation: 'Splitting a linked video clip automatically splits its associated audio track at the exact same microsecond.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Activate the Razor Tool',
				description:
					'Press C on your keyboard or click the Razor icon (angled blade) on the timeline toolbar.',
				shortcutBadge: 'C'
			},
			{
				stepNumber: 2,
				title: 'Position Your Cut Point',
				description:
					'Move the razor cursor over the clip at the exact frame where you want the split. With Magnetic Snapping enabled (S), the razor snaps to the playhead and clip markers for 100% frame accuracy.',
				tip: 'You can press J, K, L or the Left/Right arrows to scrub frame-by-frame before cutting.'
			},
			{
				stepNumber: 3,
				title: 'Click to Split the Clip',
				description:
					'Click the left mouse button. The clip instantly divides into two separate, independent clips sharing identical visual properties and transitions.',
				shortcutBadge: 'Click'
			},
			{
				stepNumber: 4,
				title: 'Split All Tracks at Once',
				description:
					'Hold Shift while clicking with the Razor tool to slice across every unlocked audio, video, and title track simultaneously.',
				shortcutBadge: 'Shift + Click'
			},
			{
				stepNumber: 5,
				title: 'Keyboard Split Shortcut',
				description:
					'You can also slice clips without switching tools by placing the playhead and pressing Cmd+K (Mac) or Ctrl+K (Windows) to split selected clips.',
				shortcutBadge: 'Cmd/Ctrl + K'
			}
		],
		quickTips: [
			'Press Cmd/Ctrl+K while using the Selection Tool to cut at the playhead without touching the mouse.',
			'Press V immediately after making your cuts to switch back to the Selection Tool.',
			'If you cut in the wrong place, press Cmd/Ctrl+Z to undo without losing any downstream edits.',
			'Lock background music tracks before using Shift+Click so you do not accidentally slice your background soundtrack.'
		],
		keyboardShortcuts: [
			{ action: 'Activate Razor Tool', key: 'C' },
			{ action: 'Split Selected Clips at Playhead', key: 'K', modifier: 'Cmd/Ctrl' },
			{ action: 'Slice All Unlocked Tracks', key: 'Click', modifier: 'Shift' },
			{ action: 'Switch Back to Selection Tool', key: 'V' }
		],
		faq: [
			{
				question: 'Does cutting a clip degrade video quality or create dropped frames?',
				answer:
					'No. All cuts in The Free Video Editor are non-destructive metadata operations. The underlying video file is never altered or re-encoded until final export.'
			},
			{
				question: 'How do I heal or rejoin a through-cut?',
				answer:
					'Click the cut boundary line between the two adjacent clips and press Delete/Backspace, or delete the second clip and drag the right edge of the first clip to restore the length.'
			},
			{
				question: 'Can I cut while the video is playing?',
				answer:
					'Yes! Press Cmd/Ctrl+K during playback to drop cuts on the fly in real-time as you listen to dialogue or music.'
			}
		],
		relatedTools: ['selection-tool', 'ripple-edit-tool', 'smart-cut-silence-removal', 'marker-tool']
	},
	{
		id: 'ripple-edit-tool',
		title: 'Ripple Edit Tool',
		subtitle: 'Trim clips while automatically closing gaps and pulling downstream clips in sync.',
		category: 'timeline',
		categoryLabel: 'Timeline & Cuts',
		shortcut: 'B',
		workspace: 'Editing',
		difficulty: 'Intermediate',
		icon: 'ripple',
		readingTimeMinutes: 5,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'The Ripple Edit Tool (B) is the single biggest time-saver for narrative and dialogue editors. Unlike standard trimming which leaves an empty gap or requires you to manually drag every subsequent clip forward, Ripple Edit trims your clip and automatically ripples the rest of the timeline to maintain seamless continuity without breaking sync.',
		whenToUse: [
			'Trimming heads or tails of clips without leaving black gaps in your edit.',
			'Tightening dialogue pacing between two actors in an interview or scene.',
			'Shortening a scene and having all downstream music, b-roll, and titles move together automatically.',
			'Eliminating unwanted pauses and keeping linked audio and video frame-accurate.'
		],
		anatomy: [
			{
				feature: 'Yellow Bracket Cursor',
				explanation: 'Displays a bold yellow bracket indicating an active ripple edit mode on the clip edge.'
			},
			{
				feature: 'Directional Arrow',
				explanation: 'An inward or outward arrow indicates which direction downstream timeline media will shift.'
			},
			{
				feature: 'Dynamic Duration Readout',
				explanation: 'A tooltip displays the exact number of frames added or subtracted from the sequence duration.'
			},
			{
				feature: 'Sync-Lock Protection',
				explanation: 'Tracks with sync-lock enabled shift together, preventing video and audio from losing sync.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Select the Ripple Edit Tool',
				description:
					'Press B on your keyboard or select the Ripple Edit Tool icon from the timeline toolbar.',
				shortcutBadge: 'B'
			},
			{
				stepNumber: 2,
				title: 'Hover Over the Edit Point',
				description:
					'Move your cursor to the in-point (start) or out-point (end) of the clip you want to adjust until the yellow ripple bracket appears.',
				tip: 'Yellow brackets indicate ripple trimming; red brackets indicate standard non-rippling trimming.'
			},
			{
				stepNumber: 3,
				title: 'Drag to Trim with Automatic Ripple',
				description:
					'Click and drag the boundary inward to shorten the clip, or outward to lengthen it. Notice how all subsequent clips on the timeline follow your mouse smoothly, closing the gap instantly.',
				shortcutBadge: 'Drag'
			},
			{
				stepNumber: 4,
				title: 'Ripple Delete a Selected Clip or Gap',
				description:
					'To delete an entire clip or blank gap and close the hole in one keystroke, select it and press Shift+Delete (or Shift+Backspace on Mac).',
				shortcutBadge: 'Shift + Delete'
			},
			{
				stepNumber: 5,
				title: 'Top & Tail Ripple Trimming',
				description:
					'Position the playhead and press Q to ripple trim the start of the clip to the playhead, or W to ripple trim the end of the clip to the playhead.',
				shortcutBadge: 'Q / W'
			}
		],
		quickTips: [
			'Use Q and W keys for lightning-fast rough cutting: Q trims the beginning to the playhead, W trims the end.',
			'Always lock music tracks before performing major ripple edits if you want your background song to remain stationary.',
			'Hold Shift while dragging to snap the ripple edit to markers or the playhead.',
			'Ripple Edit is completely non-destructive: dragging the clip edge back outward restores the trimmed frames.'
		],
		keyboardShortcuts: [
			{ action: 'Activate Ripple Edit Tool', key: 'B' },
			{ action: 'Ripple Trim In-Point to Playhead', key: 'Q' },
			{ action: 'Ripple Trim Out-Point to Playhead', key: 'W' },
			{ action: 'Ripple Delete Selection', key: 'Delete', modifier: 'Shift' },
			{ action: 'Lock / Protect Track', key: 'Click Lock Icon' }
		],
		faq: [
			{
				question: 'How is Ripple Edit different from standard Selection trim?',
				answer:
					'Standard trimming changes the length of the clip but leaves adjacent clips in place, creating empty gaps. Ripple Edit moves all subsequent clips forward or backward, keeping the entire sequence gap-free.'
			},
			{
				question: 'Why did my background music track move when I ripple-trimmed video?',
				answer:
					'Downstream tracks shift together during ripple operations. To keep music stationary while trimming dialogue, click the padlock icon on the music track header to lock it.'
			},
			{
				question: 'Can I ripple-edit across multiple tracks simultaneously?',
				answer:
					'Yes. If multiple clips share an aligned cut point across tracks, dragging the yellow bracket will ripple-edit all aligned clips simultaneously.'
			}
		],
		relatedTools: ['selection-tool', 'razor-tool', 'slip-tool', 'smart-cut-silence-removal']
	},
	{
		id: 'track-select-tool',
		title: 'Track Select Forward Tool',
		subtitle: 'Select all clips forward across all tracks or a single track to make space or shift scenes.',
		category: 'timeline',
		categoryLabel: 'Timeline & Cuts',
		shortcut: 'A',
		workspace: 'Editing',
		difficulty: 'Beginner',
		icon: 'track-select',
		readingTimeMinutes: 3,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'The Track Select Forward Tool (A) allows you to select every clip downstream from your cursor across all tracks with a single click. When you need to insert a newly filmed scene, create space for a transition, or push the second half of your video down the timeline, Track Select avoids tedious manual lassoing.',
		whenToUse: [
			'Opening up space in the middle of a project to insert a new scene or b-roll sequence.',
			'Moving the entire rest of a movie or commercial without leaving clips behind.',
			'Selecting everything downstream on a single track (Shift+A) to adjust only voiceover or graphics.',
			'Organizing complex multi-track timelines with dozens of audio and video layers.'
		],
		anatomy: [
			{
				feature: 'Double Right Arrow Cursor',
				explanation: 'Displays two rightward-pointing arrows indicating forward selection across all tracks.'
			},
			{
				feature: 'Single Arrow Cursor (Shift)',
				explanation: 'Holding Shift displays a single arrow for selecting forward on only the current active track.'
			},
			{
				feature: 'Bulk Highlight Border',
				explanation: 'Every selected clip across all tracks highlights simultaneously.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Select the Track Select Tool',
				description:
					'Press A on your keyboard or click the Track Select Forward icon on the timeline toolbar.',
				shortcutBadge: 'A'
			},
			{
				stepNumber: 2,
				title: 'Target Your Starting Point',
				description:
					'Position the cursor over the first clip where you want the selection to begin.',
				tip: 'Every clip located at or to the right of the click point will be included.'
			},
			{
				stepNumber: 3,
				title: 'Click to Select Everything Forward',
				description:
					'Click once. Every clip across video, audio, text, and adjustment tracks highlights immediately.',
				shortcutBadge: 'Click'
			},
			{
				stepNumber: 4,
				title: 'Drag to Push or Pull Downstream Media',
				description:
					'Click and drag any of the highlighted clips to move the entire block forward or backward in time.',
				shortcutBadge: 'Drag'
			},
			{
				stepNumber: 5,
				title: 'Select on Single Track Only',
				description:
					'Hold Shift while clicking to select forward exclusively on the single track under your cursor.',
				shortcutBadge: 'Shift + Click'
			}
		],
		quickTips: [
			'Press V immediately after moving your clips to return to normal selection mode.',
			'Combine Track Select with Magnetic Snapping (S) to align the pushed block perfectly against an incoming clip.',
			'Track Select respects locked tracks: lock a track if you do not want its clips to be moved.'
		],
		keyboardShortcuts: [
			{ action: 'Activate Track Select Forward Tool', key: 'A' },
			{ action: 'Select Forward on Single Track Only', key: 'Click', modifier: 'Shift' },
			{ action: 'Return to Selection Tool', key: 'V' }
		],
		faq: [
			{
				question: 'How do I select backward instead of forward?',
				answer:
					'You can hold Shift+Option/Alt or marquee-select backward with the Selection Tool (V) to grab preceding clips.'
			},
			{
				question: 'Will Track Select move clips on locked tracks?',
				answer:
					'No. Any track that has its padlock icon toggled on is completely immune to selection and movement.'
			}
		],
		relatedTools: ['selection-tool', 'ripple-edit-tool', 'razor-tool']
	},
	{
		id: 'slip-tool',
		title: 'Slip Tool',
		subtitle: "Shift a clip's internal in and out points without altering its timeline position or length.",
		category: 'timeline',
		categoryLabel: 'Timeline & Cuts',
		shortcut: 'Y',
		workspace: 'Editing',
		difficulty: 'Advanced',
		icon: 'slip',
		readingTimeMinutes: 5,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			"The Slip Tool (Y) is an indispensable secret weapon used by high-end Hollywood and commercial editors. It lets you change which portion of the source footage appears inside a clip without moving the clip on the timeline or changing its duration. If a cut is timed perfectly to music or dialogue, but the actor's best facial expression happened 2 seconds earlier in the raw take, the Slip Tool adjusts the footage inside the cut in real-time.",
		whenToUse: [
			'Fine-tuning the exact start and end action of a clip without disturbing musical rhythm.',
			'Centering a fast camera movement or vehicle pass inside a fixed-duration b-roll slot.',
			'Revealing the perfect reaction shot in dialogue scenes without altering adjacent cuts.',
			'Re-aligning lip sync when audio and video cuts have already been established.'
		],
		anatomy: [
			{
				feature: 'Slip Bracket Cursor',
				explanation: 'Displays two opposing vertical brackets with inward arrows indicating internal media slippage.'
			},
			{
				feature: 'Dual-Monitor 2-Up View',
				explanation: 'The Program Monitor displays the incoming in-point frame and outgoing out-point frame side-by-side during dragging.'
			},
			{
				feature: 'Handle Indicator',
				explanation: 'Shows how much unused raw media remains at the head or tail of the source file.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Activate the Slip Tool',
				description:
					'Press Y on your keyboard or select the Slip Tool icon on the timeline toolstrip.',
				shortcutBadge: 'Y'
			},
			{
				stepNumber: 2,
				title: 'Hover Over the Target Clip',
				description:
					'Place the slip cursor directly over the middle body of the clip you wish to adjust.',
				tip: 'The clip must have extra "handles" (unused raw footage before or after the current cut boundaries).'
			},
			{
				stepNumber: 3,
				title: 'Drag Left or Right to Slip Media',
				description:
					'Click and drag horizontally. Dragging left slips the footage forward in time; dragging right slips it backward. The clip length on the timeline remains identical.',
				shortcutBadge: 'Drag'
			},
			{
				stepNumber: 4,
				title: 'Monitor Boundary Frames',
				description:
					'Watch the Program Monitor to see the exact start and end frames update in real-time until you find the perfect moment.',
				tip: 'Release the mouse button when the desired action aligns with your cut.'
			}
		],
		quickTips: [
			'If a clip refuses to slip in one direction, you have reached the beginning or end of the raw media file (zero handle remaining).',
			'Use the Left and Right arrow keys while holding the Slip Tool to slip footage frame-by-frame for micro-precision.',
			'Slip edits work on audio tracks as well as video tracks.'
		],
		keyboardShortcuts: [
			{ action: 'Activate Slip Tool', key: 'Y' },
			{ action: 'Nudge Slip 1 Frame Left / Right', key: 'Left / Right Arrow', modifier: 'Alt/Option' },
			{ action: 'Nudge Slip 5 Frames Left / Right', key: 'Left / Right Arrow', modifier: 'Shift+Alt' }
		],
		faq: [
			{
				question: 'What is the difference between Slip and Slide?',
				answer:
					'Slip changes the internal media while keeping the clip position and duration stationary. Slide moves the clip along the timeline, changing the durations of the neighboring clips before and after it.'
			},
			{
				question: 'Can I slip multiple clips at the same time?',
				answer:
					'Yes, select multiple clips and drag with the Slip Tool to adjust their internal timecodes simultaneously.'
			}
		],
		relatedTools: ['selection-tool', 'ripple-edit-tool', 'razor-tool']
	},
	{
		id: 'type-tool',
		title: 'Type Tool & Titles',
		subtitle: 'Create horizontal text layers, animated titles, lower-thirds, and cinematic typography.',
		category: 'graphics',
		categoryLabel: 'Titles & Typography',
		shortcut: 'T',
		workspace: 'Graphics',
		difficulty: 'Beginner',
		icon: 'text',
		readingTimeMinutes: 5,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'The Type Tool (T) gives you comprehensive typographic power right inside your browser. Place text anywhere on the video preview, customize fonts with 25+ curated Google Fonts, customize font weight, size, letter spacing, alignment, outline strokes, glowing drop shadows, and modern background pills. Animate text on and off with keyframes or kinetic title presets.',
		whenToUse: [
			'Adding title cards, chapter markers, and opening credits.',
			'Designing professional animated lower-thirds for interview speakers.',
			'Creating callouts, arrows, and informative annotations for tutorial videos.',
			'Displaying social media handles, website URLs, and call-to-actions.',
			'Designing kinetic lyric videos with customized font styling.'
		],
		anatomy: [
			{
				feature: 'Type Tool Cursor',
				explanation: 'Displays a classic typographic I-beam cursor for placing text on the preview monitor.'
			},
			{
				feature: 'On-Screen Bounding Box',
				explanation: 'A live transform frame with drag handles for scaling, rotating, and repositioning text directly.'
			},
			{
				feature: 'Typography Inspector',
				explanation: 'Dedicated controls for font family, size, weight, line-height, letter-spacing, text align, fill, stroke, shadow, and background pill.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Select the Type Tool',
				description:
					'Press T on your keyboard or click the "T" icon on the timeline toolstrip.',
				shortcutBadge: 'T'
			},
			{
				stepNumber: 2,
				title: 'Click on the Program Monitor',
				description:
					'Click anywhere on the video canvas where you want your text to appear. A new text clip is automatically placed at the playhead position on the topmost video track.',
				shortcutBadge: 'Click'
			},
			{
				stepNumber: 3,
				title: 'Type Your Content',
				description:
					'Type your headline, title, or caption text directly on screen.',
				tip: 'Press Enter for a new line; click outside or press Escape to finalize editing.'
			},
			{
				stepNumber: 4,
				title: 'Customize Typography in Properties',
				description:
					'In the Properties Inspector on the right, select from over 25 web fonts (Montserrat, Bebas Neue, Playfair Display, Space Mono, etc.), adjust size, letter spacing, and alignment.',
				shortcutBadge: 'Inspector'
			},
			{
				stepNumber: 5,
				title: 'Add Stroke, Shadow & Background Pill',
				description:
					'Enable Outline Stroke to make your text readable over bright backgrounds, or toggle the Background Pill feature for clean, modern subtitle styling.',
				tip: 'Customize pill corner radius and padding for a sleek broadcast aesthetic.'
			}
		],
		quickTips: [
			'Use high-contrast stroke outlines (e.g. white text with a 3px black stroke) so text remains readable on any background.',
			'Switch to the Graphics Workspace (Alt+Shift+7) for an expanded canvas monitor and dedicated text styling tools.',
			'Animate your titles smoothly by adding keyframes to Position and Opacity in the Inspector.'
		],
		keyboardShortcuts: [
			{ action: 'Activate Type Tool', key: 'T' },
			{ action: 'Finish Editing Text', key: 'Escape' },
			{ action: 'Switch to Graphics Workspace', key: '7', modifier: 'Shift+Alt' }
		],
		faq: [
			{
				question: 'Can I use custom Google Fonts?',
				answer:
					'Yes! The Free Video Editor comes preloaded with popular Google Web Fonts like Inter, Montserrat, Bebas Neue, Oswald, Poppins, Roboto, Playfair Display, and more.'
			},
			{
				question: 'How do I center my text on the screen?',
				answer:
					'In the Text section of the Inspector, use the Center Alignment button, or drag the text gizmo until the smart guide crosshairs snap to the center of the canvas.'
			}
		],
		relatedTools: ['rectangle-tool', 'transform-gizmo-crop', 'auto-captions', 'keyframes-graph-editor']
	},
	{
		id: 'rectangle-tool',
		title: 'Rectangle & Shape Tool',
		subtitle: 'Draw vector shapes, solid color overlays, background banners, and callout graphics.',
		category: 'graphics',
		categoryLabel: 'Titles & Typography',
		shortcut: 'R',
		workspace: 'Graphics',
		difficulty: 'Beginner',
		icon: 'rect',
		readingTimeMinutes: 3,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'The Rectangle & Shape Tool allows you to draw colored vector overlays, bounding boxes, lower-third graphic backdrops, and solid color mats directly on the program monitor. You can customize fill colors, border strokes, corner rounding, opacity, and blend modes.',
		whenToUse: [
			'Creating solid or semi-transparent backdrops behind text titles.',
			'Designing lower-third banner bars for name tags and interview titles.',
			'Highlighting specific areas of a screen recording or tutorial.',
			'Creating colored letterbox bars or split-screen borders.',
			'Designing motion graphic wipe elements.'
		],
		anatomy: [
			{
				feature: 'Crosshair Draw Cursor',
				explanation: 'Click and drag on the program monitor to define width, height, and corner positions.'
			},
			{
				feature: 'Interactive Corner Handles',
				explanation: 'Resize and reshape boxes directly on canvas.'
			},
			{
				feature: 'Shape Styling Panel',
				explanation: 'Configure fill color, stroke color, border width, corner radius, and blend mode.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Select the Rectangle Tool',
				description:
					'Click the Rectangle Tool icon on the timeline toolstrip.',
				shortcutBadge: 'Toolbar'
			},
			{
				stepNumber: 2,
				title: 'Draw the Shape on Canvas',
				description:
					'Click and drag on the video monitor to draw the shape with the desired dimensions. A new shape clip is added to the timeline.',
				shortcutBadge: 'Drag'
			},
			{
				stepNumber: 3,
				title: 'Style the Fill and Border',
				description:
					'In the Properties Inspector, pick a fill color, adjust opacity, add a stroke border, and dial in the corner radius for smooth rounded edges.',
				tip: 'Set opacity to 70% for modern frosted glass appearance.'
			},
			{
				stepNumber: 4,
				title: 'Position Behind Text Layers',
				description:
					'In the timeline, place the shape track below your text track so the text floats cleanly on top of the banner.',
				shortcutBadge: 'Timeline'
			}
		],
		quickTips: [
			'Hold Shift while drawing to constrain the shape to a perfect square.',
			'Use corner radius slider to turn rectangles into smooth pill buttons or rounded badges.',
			'Combine with the Transform Gizmo to animate shapes entering the screen with keyframed position.'
		],
		keyboardShortcuts: [
			{ action: 'Constrain to Square / Aspect Ratio', key: 'Drag', modifier: 'Shift' },
			{ action: 'Scale from Center', key: 'Drag', modifier: 'Alt/Option' }
		],
		faq: [
			{
				question: 'Can I add a blur effect to the background behind the shape?',
				answer:
					'Yes! Create an Adjustment Layer beneath the shape and apply the Gaussian Blur shader in the Effects panel to produce a modern frosted glass backdrop.'
			},
			{
				question: 'How do I change the corner rounding or make a pill shape?',
				answer:
					'In the Properties Inspector under Shape Properties, increase the Corner Radius slider. Setting the corner radius to half the shape height creates a smooth pill button.'
			}
		],
		relatedTools: ['type-tool', 'transform-gizmo-crop', 'keyframes-graph-editor']
	},
	{
		id: 'marker-tool',
		title: 'Marker Tool',
		subtitle: 'Place 8-color frame-accurate markers for notes, musical beats, sync points, and navigation.',
		category: 'timeline',
		categoryLabel: 'Timeline & Cuts',
		shortcut: 'M',
		workspace: 'Editing',
		difficulty: 'Beginner',
		icon: 'mark',
		readingTimeMinutes: 4,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'The Marker Tool (M) lets you drop frame-accurate cue points on both individual clips and the master sequence timeline. With 8 distinct colors (Green, Red, Purple, Orange, Yellow, White, Blue, Cyan), customizable notes, and instant keyboard navigation, markers help you organize complex documentary edits, sync multi-camera shoots, and cut video to musical beats.',
		whenToUse: [
			'Marking drum beats and musical drops to cut footage rhythmically.',
			'Leaving editorial notes and to-do reminders for revision passes.',
			'Highlighting the best soundbites in long-form podcast recordings.',
			'Setting sync reference points between separate external audio recorders and camera footage.',
			'Marking chapter boundaries for YouTube video export.'
		],
		anatomy: [
			{
				feature: '8 Semantic Colors',
				explanation: 'Color-code your markers: Green (Approved), Red (Fix Needed), Blue (Music Beat), Yellow (Note), etc.'
			},
			{
				feature: 'Sequence vs Clip Scope',
				explanation: 'Dropping a marker with a clip selected binds it to the clip; dropping with no selection places it on the sequence ruler.'
			},
			{
				feature: 'Marker Dialog & Notes',
				explanation: 'Double-click any marker to add custom comments, tags, and duration spans.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Position the Playhead',
				description:
					'Move the playhead to the exact frame where you wish to leave a marker, or start playback to mark on the fly.',
				shortcutBadge: 'Space / Play'
			},
			{
				stepNumber: 2,
				title: 'Press M to Add a Marker',
				description:
					'Press M on your keyboard or click the Marker icon on the timeline toolstrip. A marker badge appears instantly at the current frame.',
				shortcutBadge: 'M'
			},
			{
				stepNumber: 3,
				title: 'Mark on the Fly During Playback',
				description:
					'Play your music track and tap M repeatedly on every beat. Markers will drop in real-time, giving you visual snapping targets for quick cutting.',
				tip: 'Magnetic Snapping (S) snaps cuts and clip boundaries directly to markers.'
			},
			{
				stepNumber: 4,
				title: 'Customize Color & Notes',
				description:
					'Double-click any marker or press M a second time while over a marker to open the Marker Dialog. Pick a color and type notes.',
				shortcutBadge: 'Double-Click'
			},
			{
				stepNumber: 5,
				title: 'Jump Between Markers',
				description:
					'Use Shift+M to jump to the next marker forward, and Cmd/Ctrl+Shift+M to jump backward.',
				shortcutBadge: 'Shift + M'
			}
		],
		quickTips: [
			'To delete a marker, right-click it and choose "Clear Marker", or press Alt/Option+M over the marker.',
			'Clip markers stay attached to the clip when you move it; sequence markers stay fixed to the timeline timecode.',
			'Use green markers for approved B-roll selections and red markers for portions that require color or audio cleanup.'
		],
		keyboardShortcuts: [
			{ action: 'Add Marker / Edit Marker at Playhead', key: 'M' },
			{ action: 'Jump to Next Marker', key: 'M', modifier: 'Shift' },
			{ action: 'Jump to Previous Marker', key: 'M', modifier: 'Cmd/Ctrl+Shift' },
			{ action: 'Delete Marker at Playhead', key: 'M', modifier: 'Alt/Option' }
		],
		faq: [
			{
				question: 'How do I place a marker on a clip rather than the timeline ruler?',
				answer:
					'Select the clip first (so it highlights with a border), then press M. The marker will attach to that clip and travel with it whenever you move it.'
			},
			{
				question: 'Can markers be exported as YouTube chapters?',
				answer:
					'Yes! Sequence markers with text names can be copied as timestamped chapter lists for YouTube descriptions.'
			}
		],
		relatedTools: ['selection-tool', 'razor-tool', 'smart-cut-silence-removal']
	},
	{
		id: 'smart-cut-silence-removal',
		title: 'Smart Cut: AI Silence Removal',
		subtitle: 'Automatic Voice Activity Detection (VAD) that ripple-trims pauses and dead air in one click.',
		category: 'ai',
		categoryLabel: 'AI Magic Tools',
		shortcut: 'Alt+Shift+2',
		workspace: 'AI',
		difficulty: 'Intermediate',
		icon: 'silence',
		readingTimeMinutes: 5,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'Smart Cut is an on-device AI editing engine built on Voice Activity Detection (VAD). It scans your recorded podcasts, interviews, tutorials, and vlog footage for pauses, breath pauses, and dead air. With customizable noise threshold, minimum silence duration, and speech padding margins, it executes frame-accurate ripple cuts across synchronized video and audio in a fraction of a second—with zero bytes uploaded to external clouds.',
		whenToUse: [
			'Cleaning up raw podcast or webinar recordings in seconds instead of hours.',
			'Tightening YouTube videos and educational lectures for high-retention pacing.',
			'Eliminating pauses between sentences while maintaining natural speech rhythm.',
			'Creating fast-paced jump cuts for TikTok, Instagram Reels, and YouTube Shorts.'
		],
		anatomy: [
			{
				feature: 'Silence Detection Threshold',
				explanation: 'Threshold slider (dB) to distinguish quiet vocal whispers from actual background silence.'
			},
			{
				feature: 'Min Pause Duration',
				explanation: 'Defines how long a pause must last (e.g. 400ms) before it qualifies for removal.'
			},
			{
				feature: 'Speech Padding Buffer',
				explanation: 'Adds millisecond buffers (100ms–250ms) before and after speech to ensure words and breaths are not abruptly clipped.'
			},
			{
				feature: 'Sync-Safe Linked Ripple',
				explanation: 'Splits and ripples all linked audio and video tracks synchronously to prevent A/V drift.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Switch to the AI Workspace',
				description:
					'Press Alt+Shift+2 or click "AI" in the top workspace bar to open the dedicated Smart Cut and AI tools view.',
				shortcutBadge: 'Alt+Shift+2'
			},
			{
				stepNumber: 2,
				title: 'Select Your Dialogue Clip',
				description:
					'Click the speech clip on your timeline you want to analyze.',
				shortcutBadge: 'Click'
			},
			{
				stepNumber: 3,
				title: 'Configure Detection Settings',
				description:
					'Adjust the Threshold (default -32 dB), Minimum Pause Duration (default 400ms), and Speech Padding (recommended 150ms).',
				tip: 'Higher padding values produce more natural, conversational pauses.'
			},
			{
				stepNumber: 4,
				title: 'Scan & Preview Pauses',
				description:
					'Click "Scan Dialogue". The waveform visualizer highlights every detected silent region with translucent red markers.',
				shortcutBadge: 'Scan'
			},
			{
				stepNumber: 5,
				title: 'Execute Smart Cut',
				description:
					'Click "Apply Smart Cut". The engine performs non-destructive ripple cuts across all silent segments in milliseconds, removing dead air instantly.',
				shortcutBadge: 'Apply'
			}
		],
		quickTips: [
			'Always test with a 150ms padding buffer first to preserve natural inhalation sounds before words.',
			'Smart Cut preserves complete undo history: press Cmd/Ctrl+Z at any time to reverse all cuts in one step.',
			'If recording in a noisy room, lower the threshold slider so air conditioner hum is not misidentified as speech.'
		],
		keyboardShortcuts: [
			{ action: 'Switch to AI Workspace', key: '2', modifier: 'Shift+Alt' },
			{ action: 'Undo All Smart Cuts', key: 'Z', modifier: 'Cmd/Ctrl' }
		],
		faq: [
			{
				question: 'Does Smart Cut upload my voice recording to a cloud server?',
				answer:
					'Never. The Free Video Editor runs Voice Activity Detection 100% locally on your computer inside your browser using Web Audio and WebAssembly.'
			},
			{
				question: 'Will Smart Cut cause my video and audio to lose sync?',
				answer:
					'No. Smart Cut executes synchronized linked cuts across both the video and audio tracks, preserving exact frame-level sync throughout the entire timeline.'
			}
		],
		relatedTools: ['auto-captions', 'ripple-edit-tool', 'razor-tool', 'audio-mixer-eq']
	},
	{
		id: 'auto-captions',
		title: 'Auto-Captions & Subtitles',
		subtitle: 'Transcribe speech to text with on-device Whisper AI, word-level sync, and animated styles.',
		category: 'ai',
		categoryLabel: 'AI Magic Tools',
		shortcut: 'Alt+Shift+7',
		workspace: 'Graphics / AI',
		difficulty: 'Beginner',
		icon: 'captions',
		readingTimeMinutes: 5,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'The Auto-Caption tool uses browser-native Whisper AI models (Tiny, Base, Small) powered by WebGPU and WASM to transcribe spoken dialogue into perfectly synchronized subtitles. Get word-level timing precision, animated karaoke-style highlighting, full typography styling, and instant SRT/VTT export—with zero cloud servers, zero subscription fees, and complete offline privacy.',
		whenToUse: [
			'Generating social media subtitles for Instagram Reels, TikTok, and YouTube Shorts.',
			'Making videos accessible for deaf and hard-of-hearing viewers.',
			'Exporting broadcast-standard SRT and WebVTT caption files for video players.',
			'Creating kinetic word-by-word animated lyric and dialogue titles.'
		],
		anatomy: [
			{
				feature: 'Whisper Model Selection',
				explanation: 'Choose between Whisper Tiny (fastest, lightweight), Base (balanced), and Small (maximum multilingual accuracy).'
			},
			{
				feature: 'Word-Level Timestamping',
				explanation: 'Every word receives its own microsecond timestamp for precise animated word highlighting.'
			},
			{
				feature: 'Captions Track',
				explanation: 'Captions live on a dedicated subtitle track in the timeline where you can drag and edit individual segment blocks.'
			},
			{
				feature: 'Interactive Editor & Transcript',
				explanation: 'Click any word in the transcript panel to jump the playhead to that exact speech moment.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Open the Captions Panel',
				description:
					'Switch to the Graphics or AI workspace, or click "Captions" in the panel tabs.',
				shortcutBadge: 'Panel'
			},
			{
				stepNumber: 2,
				title: 'Select AI Model & Language',
				description:
					'Click "Auto Transcribe". Choose Whisper Tiny for fast preview or Whisper Base/Small for high accuracy, and select your language.',
				tip: 'Models download once and remain cached offline in your browser storage.'
			},
			{
				stepNumber: 3,
				title: 'Generate Subtitles',
				description:
					'Click "Start Transcription". WebGPU processes the audio locally at up to 10x real-time speed. The transcript populates line-by-line.',
				shortcutBadge: 'Transcribe'
			},
			{
				stepNumber: 4,
				title: 'Style Your Subtitles',
				description:
					'In the Properties Inspector, choose your font, color, text size, outline stroke, and active word highlight colors (e.g. yellow on white).',
				tip: 'Toggle "Animated Word Highlight" for high-retention viral video styling.'
			},
			{
				stepNumber: 5,
				title: 'Export SRT or VTT',
				description:
					'Click the "Export Subtitles" button at the top of the Captions panel to download a standard `.srt` or `.vtt` file for YouTube or streaming platforms.',
				shortcutBadge: 'Export'
			}
		],
		quickTips: [
			'Double-click any caption in the timeline to fix typos or adjust spelling in the transcript editor.',
			'Hold Alt/Option while dragging caption segment edges to adjust timing independently of other lines.',
			'Use 1-line or 2-line maximum display length for clean mobile vertical viewing.'
		],
		keyboardShortcuts: [
			{ action: 'Jump to Next Caption Segment', key: 'Tab' },
			{ action: 'Jump to Previous Caption Segment', key: 'Tab', modifier: 'Shift' },
			{ action: 'Open Graphics / Captions Workspace', key: '7', modifier: 'Shift+Alt' }
		],
		faq: [
			{
				question: 'Do my audio files leave my computer?',
				answer:
					'Never. The Whisper AI neural network runs entirely inside your browser via WebGPU and WebAssembly. No audio, transcript, or personal data is ever transmitted to any external server.'
			},
			{
				question: 'Can I export burned-in subtitles as well as SRT files?',
				answer:
					'Yes! When you export your video from the Export dialog, subtitles are automatically rendered into the MP4/WebM video, or you can download the separate `.srt` file.'
			}
		],
		relatedTools: ['type-tool', 'smart-cut-silence-removal', 'audio-mixer-eq']
	},
	{
		id: 'motion-tracking',
		title: 'Motion Tracking & Masks',
		subtitle: 'Subpixel 2D point and template tracking to pin text, blur masks, and callouts to moving objects.',
		category: 'motion',
		categoryLabel: 'Motion Tracking',
		shortcut: 'Alt+Shift+5',
		workspace: 'Effects',
		difficulty: 'Advanced',
		icon: 'crosshair',
		readingTimeMinutes: 6,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'The 2D Motion Tracking engine provides subpixel optical tracking directly inside your browser. Place a tracking crosshair over any moving subject—a person, a vehicle, a face, or an object—and let the tracker follow its position frame-by-frame. Attach floating text titles, speech bubbles, emojis, or blur privacy masks that stick to the target automatically across the entire shot.',
		whenToUse: [
			'Pinning text labels, prices, or arrows to moving objects in product videos.',
			'Blurring faces, license plates, or confidential documents in documentary footage.',
			'Attaching speech bubbles or callout badges to moving people.',
			'Smoothing shaky handheld camera motion with camera stabilization.'
		],
		anatomy: [
			{
				feature: 'Tracking Search Box',
				explanation: 'The outer bounding box defines the region where the tracker searches in the next frame.'
			},
			{
				feature: 'Feature Target Crosshair',
				explanation: 'The inner crosshair defines the exact visual feature (contrast edge, logo, corner) being tracked.'
			},
			{
				feature: 'Bidirectional Pass',
				explanation: 'Allows tracking both forward and backward in time from any starting frame.'
			},
			{
				feature: 'Layer Attachment Linker',
				explanation: 'Dropdown in the Inspector to link any text layer, shape, or mask to the calculated motion path.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Switch to the Effects Workspace',
				description:
					'Press Alt+Shift+5 or click "Effects" in the workspace bar, then select the clip you want to track.',
				shortcutBadge: 'Alt+Shift+5'
			},
			{
				stepNumber: 2,
				title: 'Add a Motion Tracker',
				description:
					'In the Properties Inspector under the "Motion Tracking" section, click "+ Add Tracker". A tracking crosshair appears on the monitor.',
				shortcutBadge: '+ Add Tracker'
			},
			{
				stepNumber: 3,
				title: 'Position on a High-Contrast Feature',
				description:
					'Drag the crosshair over a distinct, high-contrast point that stays visible throughout the shot (e.g. eye, button, vehicle headlight).',
				tip: 'Adjust the outer search box size: make it larger for fast-moving objects.'
			},
			{
				stepNumber: 4,
				title: 'Run Tracking Pass',
				description:
					'Click "Track Forward" (▶) or "Track Backward" (◀). The engine analyzes the frames and plots subpixel keyframe coordinates in real time.',
				shortcutBadge: 'Track ▶'
			},
			{
				stepNumber: 5,
				title: 'Attach a Text Layer or Blur Mask',
				description:
					'Under "Attach Layer", select your text title or privacy mask. The linked layer now follows the moving subject perfectly!',
				tip: 'You can adjust the X/Y offset to float the text slightly above the tracked object.'
			}
		],
		quickTips: [
			'If tracking loses lock during a sudden whip pan, pause, reposition the crosshair on that frame, and resume tracking.',
			'Use Bidirectional Tracking: start in the middle of a clip where the subject is sharpest, track forward to the end, then return and track backward.',
			'For blurring faces, create an Ellipse Mask on an Adjustment Layer, apply Gaussian Blur, and attach the mask to the tracker.'
		],
		keyboardShortcuts: [
			{ action: 'Switch to Effects Workspace', key: '5', modifier: 'Shift+Alt' },
			{ action: 'Step 1 Frame Forward', key: 'Right Arrow' },
			{ action: 'Step 1 Frame Backward', key: 'Left Arrow' }
		],
		faq: [
			{
				question: 'What kind of objects track best?',
				answer:
					'Points with sharp contrast, defined edges, and steady lighting (such as logos, eyes, corners, or badges) track with the highest reliability.'
			},
			{
				question: 'Can I track rotation and scale as well as position?',
				answer:
					'Yes! Toggle "Track Rotation & Scale" in the tracker settings to enable dual-point tracking for expanding or rotating subjects.'
			}
		],
		relatedTools: ['transform-gizmo-crop', 'type-tool', 'keyframes-graph-editor', 'transitions-vfx']
	},
	{
		id: 'transform-gizmo-crop',
		title: 'Transform Gizmo & Crop Tool',
		subtitle: 'Interactive on-canvas bounding box with corner handles, anchor points, and 4-sided cropping.',
		category: 'graphics',
		categoryLabel: 'Titles & Typography',
		shortcut: 'V',
		workspace: 'Editing',
		difficulty: 'Beginner',
		icon: 'gizmo',
		readingTimeMinutes: 4,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'The Transform Gizmo is the direct-manipulation engine overlaid on the Program Monitor. Rather than typing numbers in an inspector panel, you can click, scale, rotate, and reposition clips directly on the canvas. With interactive corner handles, a movable center anchor point, and 4-sided cropping with edge feathering, you have complete spatial control over every visual layer.',
		whenToUse: [
			'Creating picture-in-picture (PiP) webcam overlays over gameplay or screen shares.',
			'Cropping unwanted edges, black letterboxes, or microphones out of a shot.',
			'Resizing 16:9 widescreen footage to fit 9:16 vertical shorts.',
			'Rotating horizons to level crooked camera angles.',
			'Repositioning the anchor point to scale or rotate from a specific corner.'
		],
		anatomy: [
			{
				feature: 'Bounding Box Frame',
				explanation: 'A clean rectangular frame surrounding the active clip on the monitor.'
			},
			{
				feature: '8 Sizing Handles',
				explanation: 'Corner and edge handles for proportional or freeform scaling.'
			},
			{
				feature: 'Rotation Ring Handle',
				explanation: 'Hovering just outside any corner handle transforms cursor into a curved rotation handle.'
			},
			{
				feature: 'Anchor Point Target',
				explanation: 'A circular crosshair representing the center pivot of all rotation and scale transformations.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Select Clip on Timeline',
				description:
					'Click any video, image, or title clip on your timeline to activate its on-canvas Transform Gizmo.',
				shortcutBadge: 'Click'
			},
			{
				stepNumber: 2,
				title: 'Scale and Resize on Canvas',
				description:
					'Click and drag any corner handle inward or outward to resize the clip.',
				tip: 'Aspect ratio is locked by default. Hold Shift while dragging if you wish to stretch or distort.'
			},
			{
				stepNumber: 3,
				title: 'Reposition Position and Anchor',
				description:
					'Click inside the clip body to drag it to any canvas coordinate. Drag the center anchor point to change where rotation pivots from.',
				shortcutBadge: 'Drag'
			},
			{
				stepNumber: 4,
				title: 'Rotate the Clip',
				description:
					'Move your mouse slightly outside any corner handle until the curved rotation arrow appears. Drag clockwise or counterclockwise.',
				shortcutBadge: 'Rotate'
			},
			{
				stepNumber: 5,
				title: 'Apply 4-Sided Crop & Feather',
				description:
					'In the Properties Inspector under "Crop", adjust Top, Bottom, Left, or Right sliders to trim edges, and increase "Feather" for smooth soft borders.',
				shortcutBadge: 'Crop'
			}
		],
		quickTips: [
			'Double-click the rotation handle to reset rotation back to 0° degrees.',
			'Hold Shift while rotating to snap rotation in clean 15° degree increments.',
			'To reset all transforms to original 100% full-screen fit, click "Reset Transform" in the Inspector.'
		],
		keyboardShortcuts: [
			{ action: 'Constrain Aspect Ratio / Snap Rotation', key: 'Drag', modifier: 'Shift' },
			{ action: 'Scale From Center', key: 'Drag', modifier: 'Alt/Option' }
		],
		faq: [
			{
				question: 'How do I center my picture-in-picture webcam in the corner?',
				answer:
					'Drag the clip into the corner. Smart alignment guidelines will snap it to standard broadcast action-safe margins automatically.'
			},
			{
				question: 'Can I keyframe transforms using the gizmo?',
				answer:
					'Yes! Toggle the stopwatch icon next to Position or Scale in the Inspector, and moving the gizmo at different points on the timeline will automatically create animated keyframes.'
			}
		],
		relatedTools: ['selection-tool', 'type-tool', 'motion-tracking', 'keyframes-graph-editor']
	},
	{
		id: 'speed-ramping',
		title: 'Speed Ramping & Time Remap',
		subtitle: 'Create cinematic slow motion (0.1x), rapid time-lapses (16x), and smooth speed ramps.',
		category: 'timeline',
		categoryLabel: 'Timeline & Cuts',
		shortcut: 'Cmd/Ctrl+R',
		workspace: 'Editing',
		difficulty: 'Intermediate',
		icon: 'speed',
		readingTimeMinutes: 4,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'Speed Ramping and Time Remapping allows you to alter the playback rate of clips with frame-accurate time scaling. Speed up long walks into brisk time-lapses up to 16x speed, slow down action shots into dramatic 0.1x slow motion, play clips in reverse, or freeze a frame on a pivotal reaction shot—with pitch-preserved audio stretching.',
		whenToUse: [
			'Creating dramatic slow-motion impact shots in sports, dance, or cinematic b-roll.',
			'Speeding up setup steps, tutorials, or travel transitions into engaging time-lapses.',
			'Playing clips backward with instant reverse playback.',
			'Creating freeze frames to hold a title card or reaction shot.',
			'Syncing an action highlight with a heavy musical beat.'
		],
		anatomy: [
			{
				feature: 'Speed Percentage Control',
				explanation: 'Set speed from 10% (0.1x slow motion) up to 1600% (16x rapid time-lapse).'
			},
			{
				feature: 'Ripple Sequence Checkbox',
				explanation: 'When checked, changing clip speed shifts downstream timeline clips automatically to prevent gaps or overlaps.'
			},
			{
				feature: 'Pitch Correction',
				explanation: 'Preserves vocal pitch so sped-up dialogue does not sound like chipmunks and slow-mo does not sound demonic.'
			},
			{
				feature: 'Reverse Playback Toggle',
				explanation: 'Instantly reverses video and audio playback.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Open the Speed/Duration Dialog',
				description:
					'Select your clip and press Cmd+R (Mac) or Ctrl+R (Windows), or right-click the clip and select "Speed/Duration...".',
				shortcutBadge: 'Cmd/Ctrl + R'
			},
			{
				stepNumber: 2,
				title: 'Set Your Playback Speed',
				description:
					'Type a percentage (e.g. 50% for half-speed slow motion, 400% for 4x time-lapse) or specify an exact target duration.',
				tip: 'To fit a clip into an exact musical measure, enter the target timecode directly.'
			},
			{
				stepNumber: 3,
				title: 'Enable Ripple Sequence',
				description:
					'Keep "Ripple Sequence" checked so shortening or lengthening the clip automatically adjusts all subsequent clips on the timeline.',
				shortcutBadge: 'Ripple'
			},
			{
				stepNumber: 4,
				title: 'Toggle Pitch Preservation or Reverse',
				description:
					'Check "Maintain Audio Pitch" to keep natural sound, or check "Reverse Speed" to play the footage backward.',
				tip: 'Uncheck pitch maintenance if you want classic DJ tape-slowdown effects.'
			},
			{
				stepNumber: 5,
				title: 'Click OK to Apply',
				description:
					'The clip duration updates immediately on the timeline, displaying its active speed percentage badge (e.g. [50%]).',
				shortcutBadge: 'OK'
			}
		],
		quickTips: [
			'For best slow-motion results, shoot your source footage at 60fps, 120fps, or higher.',
			'To create a freeze frame, place the playhead on the frame, right-click, and choose "Insert Freeze Frame (2s)".',
			'Combine speed ramping with motion blur in the Effects panel for hyper-smooth fast-forward shots.'
		],
		keyboardShortcuts: [
			{ action: 'Open Speed/Duration Dialog', key: 'R', modifier: 'Cmd/Ctrl' },
			{ action: 'Insert Freeze Frame at Playhead', key: 'F', modifier: 'Shift' }
		],
		faq: [
			{
				question: 'Does slow motion work with audio?',
				answer:
					'Yes! The Free Video Editor uses high-quality Web Audio time-stretching with phase vocoder pitch correction, keeping speech intelligible even at 50% speed.'
			},
			{
				question: 'How do I ramp speed gradually from fast to slow?',
				answer:
					'Split the clip into sections with the Razor Tool (C), assign progressive speeds (e.g. 200%, 150%, 100%, 50%), and add short Cross Dissolves between the cuts for smooth speed transitions.'
			}
		],
		relatedTools: ['razor-tool', 'ripple-edit-tool', 'keyframes-graph-editor', 'audio-mixer-eq']
	},
	{
		id: 'color-grading',
		title: 'Color Wheels & Scopes Grading',
		subtitle: 'Professional 3-way color wheels (Lift/Gamma/Gain), Kelvin white balance, 3D LUTs, and real-time scopes.',
		category: 'color',
		categoryLabel: 'Color & Scopes',
		shortcut: 'Alt+Shift+4',
		workspace: 'Color',
		difficulty: 'Intermediate',
		icon: 'color-wheels',
		readingTimeMinutes: 6,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'The Color Workspace brings Hollywood-grade color correction and grading into your web browser. Grade shots with industry-standard 3-Way Color Wheels for Shadows (Lift), Midtones (Gamma), and Highlights (Gain). Calibrate color temperature and tint, dial in exposure and contrast curves, import 3D LUT (.cube) film stocks, and monitor color accuracy with real-time 60fps Waveform, Vectorscope, and RGB Parade scopes.',
		whenToUse: [
			'Fixing incorrect white balance, lighting casts, and underexposed footage.',
			'Matching colors and skin tones between different cameras in a multi-camera shoot.',
			'Applying creative cinematic film looks using 3D LUT (.cube) files.',
			'Ensuring broadcast legal luminance levels using waveform scopes.',
			'Grading skin tones accurately along the vectorscope skin-tone reference line.'
		],
		anatomy: [
			{
				feature: '3-Way Color Wheels',
				explanation: 'Color wheels for Lift (Shadows), Gamma (Midtones), and Gain (Highlights) with master pedestal rings.'
			},
			{
				feature: 'White Balance & Tone',
				explanation: 'Kelvin Temperature, Magenta/Green Tint, Exposure, Contrast, Highlights, Shadows, Whites, Blacks, and Vibrance.'
			},
			{
				feature: '3D LUT (.cube) Engine',
				explanation: 'Import standard 3D LUTs with real-time blending opacity slider.'
			},
			{
				feature: 'Real-Time Scopes',
				explanation: 'Luma Waveform, Vectorscope with skin tone angle, RGB Parade, and Histogram running at 60fps via WebGL2.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Switch to the Color Workspace',
				description:
					'Press Alt+Shift+4 or click "Color" in the top workspace bar. The interface rearranges to display large side-by-side scopes and grading wheels.',
				shortcutBadge: 'Alt+Shift+4'
			},
			{
				stepNumber: 2,
				title: 'Balance Exposure & Contrast',
				description:
					'Inspect the Luma Waveform. Adjust Exposure, Highlights, and Shadows so blacks sit near 0 IRE and highlights crest near 100 IRE without clipping.',
				tip: 'Avoid crushing blacks below 0 or blowing out whites above 100.'
			},
			{
				stepNumber: 3,
				title: 'Calibrate White Balance',
				description:
					'Adjust Temperature (cooler blue to warmer amber) and Tint (green to magenta) until neutral gray objects align properly in the RGB Parade.',
				shortcutBadge: 'Temp / Tint'
			},
			{
				stepNumber: 4,
				title: 'Grade with 3-Way Wheels',
				description:
					'Drag the center crosshairs in the Lift, Gamma, and Gain wheels. For a classic cinematic teal-and-orange grade, push Lift slightly toward teal and Gain toward warm orange.',
				shortcutBadge: 'Color Wheels'
			},
			{
				stepNumber: 5,
				title: 'Import a 3D LUT (.cube)',
				description:
					'Under "Creative LUT", click "Import LUT..." and select any standard `.cube` file. Use the Opacity slider (0% to 100%) to blend the look tastefully.',
				shortcutBadge: 'Import LUT'
			}
		],
		quickTips: [
			'Always use the Vectorscope skin-tone line: human skin of any ethnicity falls along the ~10:30 angle line on the vectorscope.',
			'To apply a single grade across your entire video, add an Adjustment Layer on the top track and apply the grade to the adjustment layer.',
			'Double-click any wheel crosshair or slider to reset it back to default zero.'
		],
		keyboardShortcuts: [
			{ action: 'Switch to Color Workspace', key: '4', modifier: 'Shift+Alt' },
			{ action: 'Toggle Scopes On/Off', key: 'W', modifier: 'Alt/Option' },
			{ action: 'Bypass / Compare Color Grade', key: 'B', modifier: 'Cmd/Ctrl' }
		],
		faq: [
			{
				question: 'Can I import DaVinci Resolve or Adobe Premiere .cube LUTs?',
				answer:
					'Yes! The Free Video Editor natively parses standard 3D `.cube` files (17x17x17, 33x33x33, 65x65x65) with full hardware GPU acceleration.'
			},
			{
				question: 'Does color grading slow down timeline playback?',
				answer:
					'No. All color operations are compiled into WebGL2 GPU fragment shaders running at 60 FPS in real time.'
			}
		],
		relatedTools: ['transitions-vfx', 'transform-gizmo-crop', 'export-proxies']
	},
	{
		id: 'audio-mixer-eq',
		title: 'Audio Mixer, EQ & Compressor',
		subtitle: 'Multi-channel console mixer, 4-band parametric EQ, dynamics compression, and auto ducking.',
		category: 'audio',
		categoryLabel: 'Audio Mixer & EQ',
		shortcut: 'Alt+Shift+6',
		workspace: 'Audio',
		difficulty: 'Intermediate',
		icon: 'mixer',
		readingTimeMinutes: 5,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'The Audio Workspace transforms your browser into a full multi-track recording studio console. Mix dialogue, sound effects, and music with tactile vertical faders (+12 dB headroom) and stereo LED peak meters. Sculpt frequencies with an interactive 4-band parametric EQ, control dynamics with a visual compressor and limiter, and automatically duck background music whenever dialogue is detected.',
		whenToUse: [
			'Balancing dialogue, background music, and sound effects to broadcast loudness standards.',
			'Removing low-end rumble or air conditioner hum using high-pass / shelf filters.',
			'Taming loud volume spikes and boosting quiet whispers with dynamics compression.',
			'Automatically lowering music volume when an actor or voiceover speaks.',
			'Panning audio channels left and right for immersive stereo separation.'
		],
		anatomy: [
			{
				feature: 'Console Channel Strips',
				explanation: 'Dedicated vertical faders for every audio track plus Master bus with peak LED level meters.'
			},
			{
				feature: '4-Band Parametric EQ',
				explanation: 'Visual frequency response curve with Low Shelf, Mid Bell 1, Mid Bell 2, and High Shelf handles.'
			},
			{
				feature: 'Dynamics Compressor & Gate',
				explanation: 'Threshold, Ratio, Attack, Release, and Makeup Gain controls with visual compression gain reduction meter.'
			},
			{
				feature: 'Intelligent Audio Ducking',
				explanation: 'Automatic sidechain attenuation of music tracks during speech segments.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Switch to the Audio Workspace',
				description:
					'Press Alt+Shift+6 or click "Audio" in the workspace bar to open the expanded multi-track mixer and waveform lanes.',
				shortcutBadge: 'Alt+Shift+6'
			},
			{
				stepNumber: 2,
				title: 'Set Target Levels on Faders',
				description:
					'Play back your edit and adjust track faders so dialogue peaks consistently between -12 dBFS and -6 dBFS, while background music sits around -22 dBFS.',
				tip: 'Never allow the master meter to hit 0 dBFS (red clip LED).'
			},
			{
				stepNumber: 3,
				title: 'Sculpt Dialogue with 4-Band EQ',
				description:
					'Click the EQ button on the dialogue track. Drag the Low Shelf handle to cut low-end mud below 80 Hz, and boost the High-Mid bell slightly around 3 kHz for crisp speech presence.',
				shortcutBadge: 'EQ'
			},
			{
				stepNumber: 4,
				title: 'Apply Dynamics Compression',
				description:
					'Open the Compressor popup. Set Threshold to -18 dB and Ratio to 3:1. This smoothes out loud shouts and quiet mumbles for consistent dialogue volume.',
				shortcutBadge: 'Compressor'
			},
			{
				stepNumber: 5,
				title: 'Enable Auto Audio Ducking',
				description:
					'Select your background music track, enable "Auto Ducking", and assign it to duck speech on the dialogue track by -14 dB.',
				shortcutBadge: 'Ducking'
			}
		],
		quickTips: [
			'Target -14 LUFS integrated loudness for YouTube and streaming video platforms.',
			'Use stereo Pan knobs to place sound effects slightly left or right to create cinematic spatial depth.',
			'Solo (S) or Mute (M) individual audio tracks on the mixer to isolate problems during sound design.'
		],
		keyboardShortcuts: [
			{ action: 'Switch to Audio Workspace', key: '6', modifier: 'Shift+Alt' },
			{ action: 'Nudge Audio Gain +1 dB', key: ']', modifier: 'Cmd/Ctrl' },
			{ action: 'Nudge Audio Gain -1 dB', key: '[', modifier: 'Cmd/Ctrl' }
		],
		faq: [
			{
				question: 'How do I remove background hiss or air conditioner hum?',
				answer:
					'Open the 4-Band Parametric EQ on that track, activate the Low Shelf / High-Pass filter, and drag the frequency up to ~100 Hz to cut out sub-bass electrical hum and room rumble.'
			},
			{
				question: 'Does audio export in full 24-bit or uncompressed PCM?',
				answer:
					'Yes! When exporting MOV or high-bitrate MP4, you can choose between AAC, Opus, or uncompressed 24-bit Linear PCM audio.'
			}
		],
		relatedTools: ['smart-cut-silence-removal', 'auto-captions', 'speed-ramping', 'export-proxies']
	},
	{
		id: 'keyframes-graph-editor',
		title: 'Keyframing & Graph Editor',
		subtitle: 'Animate position, scale, rotation, opacity, and audio with visual Bezier easing curves.',
		category: 'motion',
		categoryLabel: 'Motion Tracking',
		shortcut: 'Alt+Shift+5',
		workspace: 'Effects',
		difficulty: 'Intermediate',
		icon: 'keyframes',
		readingTimeMinutes: 5,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'The Keyframing engine and Bezier Graph Editor bring smooth, organic motion animation to every parameter in The Free Video Editor. Place keyframes over time to animate position, scale, rotation, opacity, crop edges, and audio volume. Fine-tune your animations with the visual Graph Editor, shaping Bezier velocity handles for professional Ease-In and Ease-Out dynamics.',
		whenToUse: [
			'Creating slow zooms (Ken Burns effect) over still photographs and archival footage.',
			'Animating logo reveals, lower-thirds, and floating title cards onto the screen.',
			'Creating seamless whip-pan and zoom-in transitions between two scenes.',
			'Fading audio in and out smoothly at the start and end of music tracks.',
			'Fine-tuning velocity curves to make motion feel springy and natural.'
		],
		anatomy: [
			{
				feature: 'Stopwatch Toggle',
				explanation: 'Click the stopwatch icon next to any property in the Inspector to enable keyframe recording.'
			},
			{
				feature: 'Diamond Keyframe Icons',
				explanation: 'Visual markers on the timeline lane indicating active parameter keyframes.'
			},
			{
				feature: 'Bezier Curve Handles',
				explanation: 'Tangent handles in the Graph Editor allowing custom acceleration and deceleration curves.'
			},
			{
				feature: 'Next/Previous Keyframe Arrows',
				explanation: 'Jump directly to adjacent keyframe frames with 100% frame accuracy.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Select Clip and Position Playhead',
				description:
					'Click the clip you want to animate on your timeline, and move the playhead to where the animation should begin.',
				shortcutBadge: 'Timeline'
			},
			{
				stepNumber: 2,
				title: 'Enable Keyframing on a Property',
				description:
					'In the Properties Inspector, click the stopwatch icon next to the property you wish to animate (e.g. Scale or Opacity). A diamond keyframe appears.',
				shortcutBadge: 'Stopwatch'
			},
			{
				stepNumber: 3,
				title: 'Move Playhead and Change Value',
				description:
					'Scrub the playhead forward 1 or 2 seconds, then change the value (e.g. scale from 100% to 120%). A second keyframe is created automatically.',
				tip: 'Play back the timeline (Space) to preview your animation.'
			},
			{
				stepNumber: 4,
				title: 'Open the Graph Editor',
				description:
					'Click the "Graph Editor" tab in the timeline area. The parameter displays as a 2D value curve over time.',
				shortcutBadge: 'Graph Tab'
			},
			{
				stepNumber: 5,
				title: 'Apply Bezier Easing Handles',
				description:
					'Click a keyframe point on the curve, change interpolation to "Bezier", and drag the tangent handles to create a slow-out / fast-in dynamic curve.',
				tip: 'Easing prevents mechanical, robotic movement and makes animations feel polished.'
			}
		],
		quickTips: [
			'Linear keyframes move at constant speed; Bezier curves accelerate and decelerate naturally.',
			'Select multiple keyframes and press Delete to remove an animation pass cleanly.',
			'Hold Shift while dragging keyframes in the timeline to snap them to playhead or audio beats.'
		],
		keyboardShortcuts: [
			{ action: 'Jump to Next Keyframe', key: 'K', modifier: 'Alt/Option' },
			{ action: 'Jump to Previous Keyframe', key: 'J', modifier: 'Alt/Option' },
			{ action: 'Open Graph Editor', key: 'G' }
		],
		faq: [
			{
				question: 'Which properties can be keyframed in The Free Video Editor?',
				answer:
					'Nearly all clip parameters: Position (X, Y), Scale, Rotation, Opacity, Crop (Top, Bottom, Left, Right), Audio Gain, and shader effect parameters.'
			},
			{
				question: 'Can I copy and paste keyframes between clips?',
				answer:
					'Yes! Select the keyframes in the timeline lane, press Cmd/Ctrl+C to copy, select the destination clip, and press Cmd/Ctrl+V to paste.'
			}
		],
		relatedTools: ['transform-gizmo-crop', 'type-tool', 'motion-tracking', 'transitions-vfx']
	},
	{
		id: 'transitions-vfx',
		title: 'Video Transitions & Shader VFX',
		subtitle: 'Cinematic video transitions (Cross Dissolve, Dip to Black) and real-time WebGL2 GPU shader effects.',
		category: 'vfx',
		categoryLabel: 'VFX & Transitions',
		shortcut: 'Cmd/Ctrl+D',
		workspace: 'Effects',
		difficulty: 'Beginner',
		icon: 'sparkles',
		readingTimeMinutes: 5,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'The Transitions and VFX suite delivers real-time GPU-accelerated video transitions and creative visual effects. Drag cinematic cut transitions like Cross Dissolve, Dip to Black, Dip to White, Directional Slides, Pushes, Radial Wipes, and Whip Pans onto cut boundaries. Stack real-time WebGL2 shader effects—Gaussian Blur, Bloom Glow, Chromatic Aberration, Vignette, Film Grain, and Sharpen—with instant preview and zero render wait times.',
		whenToUse: [
			'Smoothing cuts between scenes with subtle Cross Dissolves.',
			'Creating dramatic scene changes with Dip to Black or Dip to White.',
			'Styling vintage footage with Film Grain, Vignette, and Chromatic Aberration.',
			'Blurring background b-roll beneath floating titles or webcam overlays.',
			'Designing dynamic whip-pan action cuts in high-energy sequences.'
		],
		anatomy: [
			{
				feature: 'Transition Handle Bar',
				explanation: 'A visual transition block overlaid on the cut seam between two adjacent clips.'
			},
			{
				feature: 'Duration Drag Edges',
				explanation: 'Drag the left or right edge of the transition block to lengthen or shorten the transition duration.'
			},
			{
				feature: 'Stackable Shader FX',
				explanation: 'Add multiple effects in any order; effects are evaluated top-down on the GPU.'
			},
			{
				feature: 'Adjustment Layer Scope',
				explanation: 'Apply transitions and effects to an Adjustment Layer to affect all underlying video tracks at once.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Open the Effects Library',
				description:
					'Switch to the Effects Workspace (Alt+Shift+5) or click the "Effects" tab in the panel layout.',
				shortcutBadge: 'Alt+Shift+5'
			},
			{
				stepNumber: 2,
				title: 'Apply a Transition to a Cut',
				description:
					'Browse the "Transitions" category, select Cross Dissolve, and drag it directly onto the seam between two adjacent video clips.',
				shortcutBadge: 'Drag to Cut'
			},
			{
				stepNumber: 3,
				title: 'Apply Default Video Transition Shortcut',
				description:
					'Alternatively, select any cut point with the Selection Tool and press Cmd+D (Mac) or Ctrl+D (Windows) to instantly apply the default Cross Dissolve.',
				shortcutBadge: 'Cmd/Ctrl + D'
			},
			{
				stepNumber: 4,
				title: 'Adjust Transition Duration & Alignment',
				description:
					'Drag the edge of the transition box on the timeline to change duration (e.g. from 0.5s to 1.5s), or select alignment in the Inspector: Center on Cut, Start at Cut, or End at Cut.',
				tip: 'Clips must have handle media (unused source frames) to extend transitions.'
			},
			{
				stepNumber: 5,
				title: 'Stack WebGL2 Shader Effects',
				description:
					'Drag an effect like "Vignette" or "Gaussian Blur" onto a clip. In the Inspector, adjust intensity sliders in real time with instant 60fps canvas preview.',
				shortcutBadge: 'Inspector'
			}
		],
		quickTips: [
			'Use Cmd/Ctrl+Shift+D to apply the default Constant Power crossfade to audio tracks.',
			'Place an Adjustment Layer across your entire timeline to apply a cinematic Film Grain and Vignette universally.',
			'To delete a transition without touching the clips, click the transition block and press Delete.'
		],
		keyboardShortcuts: [
			{ action: 'Apply Default Video Transition', key: 'D', modifier: 'Cmd/Ctrl' },
			{ action: 'Apply Default Audio Crossfade', key: 'D', modifier: 'Cmd/Ctrl+Shift' },
			{ action: 'Delete Selected Transition', key: 'Delete' }
		],
		faq: [
			{
				question: 'Why does the editor say "Insufficient media for transition"?',
				answer:
					'Transitions require "handle media"—untrimmed frames beyond the cut point on the source files. If a clip was cut at its very first or last frame, shorten the clip by a few frames to create handles.'
			},
			{
				question: 'Are shader effects hardware accelerated?',
				answer:
					'Yes! All effects execute as GLSL fragment shaders directly on your device GPU via WebGL2, ensuring real-time playback even at 4K resolution.'
			}
		],
		relatedTools: ['color-grading', 'selection-tool', 'transform-gizmo-crop', 'keyframes-graph-editor']
	},
	{
		id: 'export-proxies',
		title: 'Smart Proxies & Hardware Export',
		subtitle: 'Smooth 720p/1080p proxy editing and zero-watermark WebCodecs 4K hardware GPU export.',
		category: 'export',
		categoryLabel: 'Export & Interchange',
		shortcut: 'Cmd/Ctrl+M',
		workspace: 'Editing / Export',
		difficulty: 'Beginner',
		icon: 'export',
		readingTimeMinutes: 5,
		youtubeVideoId: null,
		youtubeUrl: '',
		overview:
			'The Export and Proxy system gives you seamless performance from initial ingest to final master delivery. Generate lightweight 720p or 1080p editing proxies on-the-fly inside your browser for buttery smooth playback on any laptop. When ready to deliver, render full-resolution 4K 60fps MP4 (H.264 / AV1) or WebM (VP9) videos utilizing your device hardware GPU encoder—with zero watermarks, no cloud queues, and zero compression paywalls.',
		whenToUse: [
			'Editing demanding 4K 60fps or 8K multi-track projects smoothly on laptops.',
			'Rendering final videos for YouTube, Instagram Reels, TikTok, or broadcast.',
			'Exporting audio-only MP3/WAV/AAC tracks for podcast publishing.',
			'Exporting OpenTimelineIO (OTIO), Final Cut Pro XML (FCPXML), or EDL to finish in DaVinci Resolve or Premiere Pro.',
			'Exporting transparent alpha-channel WebM videos for overlays and motion graphics.'
		],
		anatomy: [
			{
				feature: 'Proxy Toggle Switch',
				explanation: 'Instantly switch between lightweight proxy playback and full-resolution source footage.'
			},
			{
				feature: 'Hardware Video Encoder',
				explanation: 'Utilizes WebCodecs API to tap directly into Apple Silicon, Intel QuickSync, or NVIDIA NVENC hardware encoders.'
			},
			{
				feature: 'Preset Resolutions',
				explanation: 'One-click presets for 4K UHD, 1080p Full HD, 720p HD, and Vertical 9:16 (1080x1920).'
			},
			{
				feature: 'Pro Interchange Formats',
				explanation: 'Export project metadata to OTIO, FCPXML, and EDL for studio roundtripping.'
			}
		],
		steps: [
			{
				stepNumber: 1,
				title: 'Generate Editing Proxies (Optional)',
				description:
					'Right-click high-resolution media in your Project Media library and select "Generate 720p Proxy". Timeline scrubbing will become silky smooth.',
				shortcutBadge: 'Media Library'
			},
			{
				stepNumber: 2,
				title: 'Open the Export Dialog',
				description:
					'Click the blue "Export" button in the top navigation header or press Cmd+M (Mac) or Ctrl+M (Windows).',
				shortcutBadge: 'Cmd/Ctrl + M'
			},
			{
				stepNumber: 3,
				title: 'Choose Format and Preset',
				description:
					'Select your container format (MP4 or WebM) and choose a resolution preset (e.g. 4K 2160p, 1080p, or 9:16 Vertical Reel).',
				tip: 'MP4 (H.264) offers maximum compatibility across all devices and social platforms.'
			},
			{
				stepNumber: 4,
				title: 'Configure Bitrate & Audio',
				description:
					'Select your video bitrate (e.g. 15 Mbps for 1080p, 45 Mbps for 4K) and choose your audio codec (AAC, Opus, or 24-bit PCM).',
				shortcutBadge: 'Bitrate'
			},
			{
				stepNumber: 5,
				title: 'Render Directly on Your Device',
				description:
					'Click "Export Video". Watch the real-time progress bar. Once rendered, the file downloads directly to your device with zero cloud latency.',
				shortcutBadge: 'Export'
			}
		],
		quickTips: [
			'Even when editing with 720p proxies, the export engine automatically renders from the full-resolution source files.',
			'For YouTube 4K uploads, render with AV1 or H.264 at 50 Mbps for pristine quality.',
			'Exporting is 100% private: no frames or audio samples ever leave your local machine.'
		],
		keyboardShortcuts: [
			{ action: 'Open Export Dialog', key: 'M', modifier: 'Cmd/Ctrl' },
			{ action: 'Toggle Proxy Playback', key: 'P', modifier: 'Alt/Option' }
		],
		faq: [
			{
				question: 'Are there any export watermarks or duration limits?',
				answer:
					'None whatsoever! The Free Video Editor is 100% free with zero watermarks, zero subscription fees, and no file size or duration caps.'
			},
			{
				question: 'Can I roundtrip my edit into DaVinci Resolve or Premiere Pro?',
				answer:
					'Yes! In the Export dialog, switch to the "Interchange" tab and select OpenTimelineIO (.otio), Final Cut Pro XML (.fcpxml), or EDL (.edl).'
			}
		],
		relatedTools: ['selection-tool', 'color-grading', 'audio-mixer-eq', 'smart-cut-silence-removal']
	}
];

/**
 * Helper to fetch a guide by its slug ID.
 */
export function getGuideById(id: string): ToolGuide | undefined {
	return TOOL_GUIDES.find((g) => g.id === id);
}

/**
 * Helper to fetch related guides for a given guide.
 */
export function getRelatedGuides(guide: ToolGuide): ToolGuide[] {
	return guide.relatedTools
		.map((id) => getGuideById(id))
		.filter((g): g is ToolGuide => g !== undefined);
}

