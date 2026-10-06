import { timeToPixels } from '../../core';
import type { Time } from '../../core';

export default function Playhead({
	time,
	pixelsPerSecond,
	offset = 0
}: {
	time: Time;
	pixelsPerSecond: number;
	offset?: number;
}) {
	return (
		<div
			className="timeline-playhead"
			style={{ left: offset + timeToPixels(time, pixelsPerSecond) }}
			aria-hidden="true"
		>
			<span />
		</div>
	);
}
