import EditorShell from './ui/shell/EditorShell';
import { EditorProvider } from './state/EditorProvider';

export default function Editor() {
	return (
		<EditorProvider>
			<EditorShell />
		</EditorProvider>
	);
}
