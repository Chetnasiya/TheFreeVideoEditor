import React from 'react';
import './ai.css';

export const TranscriptView: React.FC = () => {
	return (
		<div
			className="transcript-panel"
			data-testid="transcript-panel"
			style={{
				height: '100%',
				display: 'flex',
				flexDirection: 'column',
				background: 'var(--color-canvas)',
				color: 'var(--color-body)'
			}}
		>
			<div className="ai-assistant-header">
				<span style={{ fontWeight: 600, fontSize: '12px' }}>Transcript</span>
			</div>
			<div className="ai-panel-content">
				<div style={{ textAlign: 'center', padding: '32px 16px', color: '#64748b' }}>
					Word-level interactive transcript is available when transcribing clips or aligning with
					script.
				</div>
			</div>
		</div>
	);
};

export default TranscriptView;
