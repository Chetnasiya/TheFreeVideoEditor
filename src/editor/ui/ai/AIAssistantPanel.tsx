import React from 'react';
import { SilenceTrimPanel } from './SilenceTrimPanel';
import './ai.css';

export const AIAssistantPanel: React.FC = () => {
	return (
		<div className="ai-assistant-panel" data-testid="ai-assistant-panel">
			<SilenceTrimPanel />
		</div>
	);
};

export default AIAssistantPanel;
