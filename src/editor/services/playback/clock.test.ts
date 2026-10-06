import { describe, expect, it } from 'vitest';
import { createPlaybackClock } from './clock';

function makeHarness() {
	let now = 0;
	let nextHandle = 0;
	const frames = new Map<number, FrameRequestCallback>();
	const clock = createPlaybackClock({
		duration: 2_000_000,
		fps: 30,
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
			const [handle, callback] = frames.entries().next().value ?? [];
			if (!callback || typeof handle !== 'number')
				throw new Error('No animation frame was queued.');
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
});
