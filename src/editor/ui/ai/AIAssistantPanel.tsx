import React from 'react';
import { SilenceTrimPanel } from './SilenceTrimPanel';
import './ai.css';

export const AIAssistantPanel: React.FC = () => {
	return (
		<div className="ai-assistant-panel" data-testid="ai-assistant-panel">
			<div className="ai-panel-content">
				<SilenceTrimPanel />
			</div>
		</div>
	);
};

export default AIAssistantPanel;
