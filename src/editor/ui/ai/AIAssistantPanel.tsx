import React from 'react';
import { useEditorStore } from '../../state/EditorProvider';
import { SilenceTrimPanel } from './SilenceTrimPanel';
import { ScriptAssistantView } from './ScriptAssistantView';
import './ai.css';

export const AIAssistantPanel: React.FC = () => {
	const activeTab = useEditorStore((state) => state.ai.activeTab);
	const setAiActiveTab = useEditorStore((state) => state.setAiActiveTab);

	return (
		<div className="ai-assistant-panel" data-testid="ai-assistant-panel">
			<div className="ai-assistant-header">
				<div className="ai-tab-pill-group" role="tablist" aria-label="AI Assistant Tabs">
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === 'silence'}
						className={`ai-tab-btn ${activeTab === 'silence' ? 'is-active' : ''}`}
						onClick={() => setAiActiveTab('silence')}
					>
						Silence Trim
					</button>
					<button
						type="button"
						role="tab"
						aria-selected={activeTab === 'script'}
						className={`ai-tab-btn ${activeTab === 'script' ? 'is-active' : ''}`}
						onClick={() => setAiActiveTab('script')}
					>
						Script & Takes
					</button>
				</div>
			</div>

			<div className="ai-panel-content">
				{activeTab === 'silence' ? <SilenceTrimPanel /> : <ScriptAssistantView />}
			</div>
		</div>
	);
};

export default AIAssistantPanel;
