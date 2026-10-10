import { useEffect, useRef, useState, type MouseEvent, type SyntheticEvent } from 'react';
import { useEditorStore } from '../../state/EditorProvider';

interface EditWorkspacesDialogProps {
	isOpen: boolean;
	onClose: () => void;
}

export default function EditWorkspacesDialog({ isOpen, onClose }: EditWorkspacesDialogProps) {
	const workspaces = useEditorStore((state) => state.workspaces);
	const activeWorkspaceId = useEditorStore((state) => state.activeWorkspaceId);
	const renameCustom = useEditorStore((state) => state.renameCustomWorkspace);
	const deleteCustom = useEditorStore((state) => state.deleteCustomWorkspace);
	const reorderWorkspaces = useEditorStore((state) => state.reorderWorkspaces);
	const resetWorkspace = useEditorStore((state) => state.resetWorkspaceLayout);
	const dialogRef = useRef<HTMLDialogElement>(null);

	const [editingId, setEditingId] = useState<string | null>(null);
	const [editName, setEditName] = useState('');

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (isOpen && !dialog.open) {
			dialog.showModal();
		} else if (!isOpen && dialog.open) {
			dialog.close();
		}
	}, [isOpen]);

	if (!isOpen) return null;

	const allWorkspaces = workspaces.order.map((id) => {
		const custom = workspaces.custom.find((c) => c.id === id);
		if (custom) return custom;
		const nameMap: Record<string, string> = {
			assembly: 'Assembly',
			editing: 'Editing',
			color: 'Color',
			effects: 'Effects',
			audio: 'Audio',
			graphics: 'Graphics'
		};
		return {
			id,
			name: nameMap[id] ?? id,
			builtIn: true,
			layout: { type: 'stack' as const, panelIds: [], activeId: 'program' as const }
		};
	});

	const handleMove = (index: number, direction: -1 | 1) => {
		const targetIdx = index + direction;
		if (targetIdx < 0 || targetIdx >= workspaces.order.length) return;
		const nextOrder = [...workspaces.order];
		const temp = nextOrder[index]!;
		nextOrder[index] = nextOrder[targetIdx]!;
		nextOrder[targetIdx] = temp;
		reorderWorkspaces(nextOrder);
	};

	const startRename = (id: string, currentName: string) => {
		setEditingId(id);
		setEditName(currentName);
	};

	const commitRename = (e?: SyntheticEvent) => {
		e?.preventDefault();
		if (editingId && editName.trim()) {
			renameCustom(editingId, editName.trim());
		}
		setEditingId(null);
		setEditName('');
	};

	const handleBackdropClick = (e: MouseEvent<HTMLDialogElement>) => {
		if (e.target === dialogRef.current) {
			onClose();
		}
	};

	return (
		<dialog
			ref={dialogRef}
			className="editor-dialog edit-workspaces-dialog"
			aria-labelledby="edit-workspaces-title"
			onClick={handleBackdropClick}
			onClose={onClose}
		>
			<div className="dialog-content" style={{ minWidth: '420px', maxWidth: '520px' }}>
				<header className="dialog-header">
					<h2 id="edit-workspaces-title">Manage Workspaces</h2>
					<button
						type="button"
						className="dialog-close-button"
						aria-label="Close dialog"
						onClick={onClose}
					>
						✕
					</button>
				</header>

				<div
					className="dialog-body"
					style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}
				>
					<p style={{ margin: 0, fontSize: '12px', color: 'var(--color-mute, #888)' }}>
						Reorder workspace tabs, rename or delete custom layouts, and reset default layouts.
					</p>

					<ul
						style={{
							listStyle: 'none',
							margin: 0,
							padding: 0,
							display: 'flex',
							flexDirection: 'column',
							gap: '6px',
							maxHeight: '300px',
							overflowY: 'auto'
						}}
					>
						{allWorkspaces.map((ws, index) => {
							const isEditing = editingId === ws.id;
							const isCustom = !ws.builtIn;
							const isActive = ws.id === activeWorkspaceId;

							return (
								<li
									key={ws.id}
									className="edit-workspaces-item"
									style={{
										display: 'flex',
										alignItems: 'center',
										justifyContent: 'space-between',
										padding: '6px 10px',
										background: isActive
											? 'rgba(0, 112, 243, 0.15)'
											: 'var(--color-surface, #1e1e1e)',
										border: '1px solid var(--color-hairline, #333)',
										borderRadius: '4px'
									}}
								>
									<div style={{ display: 'flex', alignItems: 'center', gap: '8px', flex: 1 }}>
										<span
											style={{ fontSize: '11px', color: 'var(--color-faint, #666)', width: '16px' }}
										>
											{index + 1}
										</span>
										{isEditing ? (
											<form
												onSubmit={commitRename}
												style={{ display: 'flex', gap: '4px', flex: 1 }}
											>
												<input
													type="text"
													value={editName}
													onChange={(e) => setEditName(e.target.value)}
													autoFocus
													style={{
														padding: '2px 6px',
														fontSize: '12px',
														background: 'var(--color-canvas, #000)',
														color: 'var(--color-ink, #fff)',
														border: '1px solid var(--color-link, #0070f3)',
														borderRadius: '3px',
														flex: 1
													}}
												/>
												<button
													type="submit"
													className="primary-button"
													style={{ padding: '2px 8px', fontSize: '11px' }}
												>
													Save
												</button>
												<button
													type="button"
													className="secondary-button"
													style={{ padding: '2px 8px', fontSize: '11px' }}
													onClick={() => setEditingId(null)}
												>
													Cancel
												</button>
											</form>
										) : (
											<span style={{ fontWeight: isActive ? 600 : 400, fontSize: '13px' }}>
												{ws.name}
												{isActive && (
													<span
														style={{
															fontSize: '10px',
															marginLeft: '6px',
															color: 'var(--color-link, #0070f3)'
														}}
													>
														(Active)
													</span>
												)}
												{!isCustom && (
													<span
														style={{
															fontSize: '10px',
															marginLeft: '6px',
															color: 'var(--color-mute, #888)'
														}}
													>
														[Default]
													</span>
												)}
											</span>
										)}
									</div>

									{!isEditing && (
										<div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
											<button
												type="button"
												className="secondary-button"
												title="Move up"
												disabled={index === 0}
												onClick={() => handleMove(index, -1)}
												style={{ padding: '2px 6px', fontSize: '10px' }}
											>
												↑
											</button>
											<button
												type="button"
												className="secondary-button"
												title="Move down"
												disabled={index === allWorkspaces.length - 1}
												onClick={() => handleMove(index, 1)}
												style={{ padding: '2px 6px', fontSize: '10px' }}
											>
												↓
											</button>
											{isCustom ? (
												<>
													<button
														type="button"
														className="secondary-button"
														onClick={() => startRename(ws.id, ws.name)}
														style={{ padding: '2px 8px', fontSize: '11px' }}
													>
														Rename
													</button>
													<button
														type="button"
														className="secondary-button"
														onClick={() => deleteCustom(ws.id)}
														style={{ padding: '2px 8px', fontSize: '11px', color: '#ff4444' }}
													>
														Delete
													</button>
												</>
											) : (
												<button
													type="button"
													className="secondary-button"
													onClick={() => resetWorkspace(ws.id)}
													title="Reset layout override"
													style={{ padding: '2px 8px', fontSize: '11px' }}
												>
													Reset
												</button>
											)}
										</div>
									)}
								</li>
							);
						})}
					</ul>
				</div>

				<footer
					className="dialog-footer"
					style={{ marginTop: '16px', display: 'flex', justifyContent: 'flex-end' }}
				>
					<button
						type="button"
						className="primary-button"
						data-testid="done-workspaces-btn"
						onClick={onClose}
					>
						Done
					</button>
				</footer>
			</div>
		</dialog>
	);
}
