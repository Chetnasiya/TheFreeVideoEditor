import { describe, expect, it } from 'vitest';
import { createPlaybackClock } from './clock';

function makeHarness(options: { fps?: number; duration?: number } = {}) {
	let now = 0;
	let nextHandle = 0;
	const frames = new Map<number, FrameRequestCallback>();
	const clock = createPlaybackClock({
		duration: options.duration ?? 2_000_000,
		fps: options.fps ?? 30,
		now: () => now,
		requestFrame(callback) {
			const handle = ++nextHandle;
			frames.set(handle, callback);
			return handle;
		},
		cancelFrame(handle) {
			frames.delete(handle);
		}
	});
	return {
		clock,
		frame(timestamp: number) {
			const nextEntry = frames.entries().next().value;
			if (!nextEntry) throw new Error('No animation frame was queued.');
			const [handle, callback] = nextEntry;
			frames.delete(handle);
			now = timestamp;
			callback(timestamp);
		},
		get pendingFrames() {
			return frames.size;
		}
	};
}

describe('playback clock', () => {
	it('advances at the master rate, pauses and seeks to frame-snapped time', () => {
		const harness = makeHarness();
		const { clock } = harness;
		clock.play();
		harness.frame(500);
		expect(clock.time).toBe(500_000);
		clock.pause();
		expect(harness.pendingFrames).toBe(0);
		expect(clock.time).toBe(500_000);
		clock.seek(1_234_000);
		expect(clock.time).toBe(1_233_333);
		clock.dispose();
	});

	it('stops at the end and loops across the boundary when enabled', () => {
		const harness = makeHarness();
		const { clock } = harness;
		clock.seek(1_900_000);
		clock.play();
		harness.frame(200);
		expect(clock.time).toBe(2_000_000);
		expect(clock.playing).toBe(false);
		clock.setLoop(true);
		clock.play();
		harness.frame(250);
		expect(clock.playing).toBe(true);
		expect(clock.time).toBeLessThan(250_000);
		clock.dispose();
	});

	it('supports reverse shuttle rates and stops at zero without looping', () => {
		const harness = makeHarness();
		const { clock } = harness;
		clock.seek(1_000_000);
		clock.setRate(-2);
		clock.play();
		harness.frame(300);
		expect(clock.time).toBe(400_000);
		harness.frame(600);
		expect(clock.time).toBe(0);
		expect(clock.playing).toBe(false);
		clock.dispose();
	});

	it('advances continuously and avoids getting stuck on sub-frame animation ticks (e.g. 24fps at 60Hz)', () => {
		const harness = makeHarness({ fps: 24 });
		const { clock } = harness;

		clock.play();
		// Simulate 60 Hz display with ~16.6ms intervals on 24 fps timeline
		for (let i = 1; i <= 6; i++) {
			harness.frame(i * 16.666);
		}
		// After ~100ms (more than 2 full frames at 24fps = 83.3ms), clock MUST have advanced!
		expect(clock.time).toBeGreaterThan(0);
		expect(clock.time).toBeGreaterThanOrEqual(80_000);
		clock.dispose();
	});

	it('advances smoothly on 30fps timeline with 16.0ms ticks without 3x stutter or freezing', () => {
		const harness = makeHarness({ fps: 30 });
		const { clock } = harness;

		clock.play();
		const times: number[] = [];
		// Simulate 6 ticks at 16.0ms (under half-frame threshold of 16.666ms)
		for (let i = 1; i <= 6; i++) {
			harness.frame(i * 16.0);
			times.push(clock.time);
		}
		// Clock must advance every tick, not stay stuck at 0 or repeat each frame 3 times
		for (let i = 1; i < times.length; i++) {
			expect(times[i]!).toBeGreaterThan(times[i - 1]!);
		}
		expect(clock.time).toBe(96_000);
		// When paused, time must snap to nearest 30fps frame boundary (96_000 -> 100_000)
		clock.pause();
		expect(clock.time).toBe(100_000);
		clock.dispose();
	});

	it('handles seeking while playing and continues seamlessly without restart glitches', () => {
		const harness = makeHarness({ duration: 5_000_000, fps: 30 });
		const { clock } = harness;

		clock.play();
		harness.frame(50);
		expect(clock.time).toBe(50_000);

		// User scrubs/seeks to 2.5s while playing
		clock.seek(2_500_000);
		expect(clock.time).toBe(2_500_000);
		expect(clock.playing).toBe(true);

		// Next tick continues from 2.5s
		harness.frame(70); // 20ms later
		expect(clock.time).toBe(2_520_000);
		expect(clock.playing).toBe(true);

		clock.dispose();
	});
});
