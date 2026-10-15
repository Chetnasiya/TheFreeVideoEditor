import { useState, useRef, useEffect, type KeyboardEvent, type MouseEvent } from 'react';

export interface PanControlProps {
	value: number; // -1.0 (L100) to +1.0 (R100)
	onChange: (value: number) => void;
	disabled?: boolean;
	label?: string;
	className?: string;
}

export function formatPanLabel(pan: number): string {
	if (!Number.isFinite(pan) || Math.abs(pan) <= 0.02) return 'C';
	if (pan < 0) return `L${Math.round(-pan * 100)}`;
	return `R${Math.round(pan * 100)}`;
}

export function formatPanAriaText(pan: number): string {
	if (!Number.isFinite(pan) || Math.abs(pan) <= 0.02) return 'Center';
	if (pan < 0) return `${Math.round(-pan * 100)}% Left`;
	return `${Math.round(pan * 100)}% Right`;
}

export function parsePanInput(input: string): number | null {
	const raw = input.trim().toLowerCase();
	if (raw === '' || raw === 'c' || raw === 'center' || raw === '0') return 0;

	if (raw.startsWith('l')) {
		const num = parseFloat(raw.slice(1));
		if (!Number.isFinite(num)) return null;
		const pan = -Math.abs(num) / 100;
		return Math.max(-1, Math.min(1, Math.abs(pan) <= 0.02 ? 0 : pan));
	}

	if (raw.startsWith('r')) {
		const num = parseFloat(raw.slice(1));
		if (!Number.isFinite(num)) return null;
		const pan = Math.abs(num) / 100;
		return Math.max(-1, Math.min(1, Math.abs(pan) <= 0.02 ? 0 : pan));
	}

	const num = parseFloat(raw);
	if (!Number.isFinite(num)) return null;
	// If entered between -1 and 1 as fraction, or between -100 and 100 as percentage
	let pan = num;
	if (Math.abs(pan) > 1.0) {
		pan = pan / 100;
	}
	pan = Math.max(-1, Math.min(1, pan));
	return Math.abs(pan) <= 0.02 ? 0 : pan;
}

export function PanControl({
	value,
	onChange,
	disabled = false,
	label = 'Pan',
	className = ''
}: PanControlProps) {
	const [isEditing, setIsEditing] = useState(false);
	const [editValue, setEditValue] = useState('');
	const inputRef = useRef<HTMLInputElement>(null);

	const clampedValue = Math.max(-1, Math.min(1, Number.isFinite(value) ? value : 0));
	const displayValue = Math.abs(clampedValue) <= 0.02 ? 0 : clampedValue;

	useEffect(() => {
		if (isEditing) {
			inputRef.current?.select();
		}
	}, [isEditing]);

	const handleSliderChange = (newVal: number) => {
		// Snap to center within +/- 2%
		const snapped = Math.abs(newVal) <= 0.02 ? 0 : newVal;
		onChange(snapped);
	};

	const handleReset = () => {
		onChange(0);
	};

	const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
		if (isEditing) {
			if (e.key === 'Enter') {
				e.preventDefault();
				commitEdit();
			} else if (e.key === 'Escape') {
				e.preventDefault();
				setIsEditing(false);
			}
			return;
		}

		const step = e.shiftKey ? 0.1 : 0.01;
		if (e.key === 'ArrowLeft' || e.key === 'ArrowDown') {
			e.preventDefault();
			const next = Math.max(-1, displayValue - step);
			handleSliderChange(next);
		} else if (e.key === 'ArrowRight' || e.key === 'ArrowUp') {
			e.preventDefault();
			const next = Math.min(1, displayValue + step);
			handleSliderChange(next);
		} else if (e.key === 'Home') {
			e.preventDefault();
			onChange(-1);
		} else if (e.key === 'End') {
			e.preventDefault();
			onChange(1);
		}
	};

	const startEditing = () => {
		if (disabled) return;
		setEditValue(formatPanLabel(displayValue));
		setIsEditing(true);
	};

	const commitEdit = () => {
		setIsEditing(false);
		const parsed = parsePanInput(editValue);
		if (parsed !== null) {
			onChange(parsed);
		}
	};

	const handleSliderMouseDown = (e: MouseEvent<HTMLInputElement>) => {
		if (e.altKey) {
			e.preventDefault();
			handleReset();
		}
	};

	return (
		<div className={`pan-control-container flex flex-col gap-0.5 ${className}`}>
			<div className="strip-pan-header flex items-center justify-between font-mono text-[10px] select-none">
				<span
					className="cursor-pointer text-[#64748b] hover:text-[#94a3b8]"
					onClick={() => onChange(-1)}
				>
					L
				</span>
				{isEditing ? (
					<input
						ref={inputRef}
						type="text"
						value={editValue}
						onChange={(e) => setEditValue(e.target.value)}
						onBlur={commitEdit}
						onKeyDown={handleKeyDown}
						className="strip-pan-edit-input w-10 rounded border border-[#38bdf8] bg-[#0f172a] px-0.5 py-0 text-center text-[10px] font-bold text-[#38bdf8] outline-none"
					/>
				) : (
					<button
						type="button"
						onClick={startEditing}
						onDoubleClick={handleReset}
						className="strip-pan-value cursor-pointer border-0 bg-transparent p-0 text-[10px] font-bold text-[#38bdf8] hover:underline"
						title="Click to edit, Double-click or Alt-click to center"
					>
						{formatPanLabel(displayValue)}
					</button>
				)}
				<span
					className="cursor-pointer text-[#64748b] hover:text-[#94a3b8]"
					onClick={() => onChange(1)}
				>
					R
				</span>
			</div>
			<div className="relative flex items-center">
				<input
					type="range"
					min="-1"
					max="1"
					step="0.01"
					value={displayValue}
					disabled={disabled}
					onChange={(e) => handleSliderChange(parseFloat(e.target.value))}
					onDoubleClick={handleReset}
					onMouseDown={handleSliderMouseDown}
					onKeyDown={handleKeyDown}
					role="slider"
					aria-label={label}
					aria-valuemin={-100}
					aria-valuemax={100}
					aria-valuenow={Math.round(displayValue * 100)}
					aria-valuetext={formatPanAriaText(displayValue)}
					className="strip-pan-slider w-full"
					title="Pan (Drag to adjust, Double-click or Alt-click to center, Arrow keys: 1%, Shift+Arrow: 10%)"
				/>
				{/* Visual center detent indicator tick */}
				<div
					className="pointer-events-none absolute top-1/2 left-1/2 h-2 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#475569] opacity-60"
					aria-hidden="true"
				/>
			</div>
		</div>
	);
}
