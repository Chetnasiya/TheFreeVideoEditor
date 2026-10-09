import {
	useEffect,
	useMemo,
	useRef,
	useState,
	type DragEvent,
	type KeyboardEvent,
	type MouseEvent,
	type CSSProperties
} from 'react';
import { ACCEPTED_TYPES, getAssetUsage, ticksToTimecode } from '../../core';
import type { Asset, AssetId, ProjectId } from '../../core';
import { useEditorStore } from '../../state/EditorProvider';
import { getDerived, type DerivedData } from '../../services/storage/mediaCache';
import { projectMediaSize, projectProxyTotalSize } from '../../services/storage/opfs';
import { openFiles } from '../../services/storage/fileAccess';
import './media-library.css';

function formatBytes(bytes: number): string {
	return new Intl.NumberFormat(undefined, {
		style: 'unit',
		unit: 'byte',
		unitDisplay: 'narrow',
		maximumFractionDigits: 1
	}).format(bytes);
}

function fileFromEntry(entry: FileSystemFileEntry): Promise<File> {
	return new Promise((resolve, reject) => {
		entry.file(resolve, reject);
	});
}

async function filesFromEntry(entry: FileSystemEntry): Promise<File[]> {
	if (entry.isFile) {
		return [await fileFromEntry(entry as FileSystemFileEntry)];
	}
	if (!entry.isDirectory) return [];
	const reader = (entry as FileSystemDirectoryEntry).createReader();
	const entries: FileSystemEntry[] = [];
	while (true) {
		const batch = await new Promise<FileSystemEntry[]>((resolve, reject) =>
			reader.readEntries(resolve, reject)
		);
		if (batch.length === 0) break;
		entries.push(...batch);
	}
	const nested = await Promise.all(entries.map((child) => filesFromEntry(child)));
	return nested.flat();
}

function timecode(asset: Asset, fps: number): string {
	if (asset.kind === 'image') return '00:00:05:00';
	try {
		return ticksToTimecode(asset.duration, fps);
	} catch {
		return '00:00:00:00';
	}
}

function AssetPreview({ asset, projectId }: { asset: Asset; projectId: ProjectId }) {
	const [derived, setDerived] = useState<DerivedData | null>(null);
	const [posterUrl, setPosterUrl] = useState('');
	useEffect(() => {
		let active = true;
		let objectUrl = '';
		void getDerived(projectId, asset.id)
			.then((value) => {
				if (!active) return;
				setDerived(value);
				if (value?.poster.size) {
					objectUrl = URL.createObjectURL(value.poster);
					setPosterUrl(objectUrl);
				}
			})
			.catch((error: unknown) => {
				console.error(`Could not read media preview for ${asset.name}.`, error);
			});
		return () => {
			active = false;
			if (objectUrl) URL.revokeObjectURL(objectUrl);
		};
	}, [asset.id, asset.name, asset.offline, asset.opfsPath, projectId]);
	if (asset.kind === 'audio' && derived?.peaks) {
		const peaks = Array.from(derived.peaks.max.slice(0, 48));
		return (
			<div className="audio-waveform" aria-label="Audio waveform preview">
				{peaks.map((peak, index) => (
					<span key={index} style={{ height: `${Math.max(8, (peak / 127) * 100)}%` }} />
				))}
			</div>
		);
	}
	if (asset.kind === 'audio' && derived?.waveformStatus === 'unavailable') {
		return (
			<div
				className="audio-waveform is-unavailable"
				title="Waveform unavailable for this file or not supported by this browser."
				aria-label="Waveform unavailable"
			>
				{Array.from({ length: 24 }, (_, index) => (
					<span key={index} />
				))}
			</div>
		);
	}
	if (posterUrl) {
		return <img className="asset-poster" src={posterUrl} alt="" width="160" height="90" />;
	}
	return (
		<div className="asset-kind-icon" aria-hidden="true">
			{asset.kind === 'video'
				? '▻'
				: asset.kind === 'audio'
					? '♫'
					: asset.kind === 'font'
						? 'T'
						: '▧'}
		</div>
	);
}

export default function MediaLibrary() {
	const project = useEditorStore((state) => state.project);
	const media = useEditorStore((state) => state.media);
	const projectMessage = useEditorStore((state) => state.projectMessage);
	const importMedia = useEditorStore((state) => state.importMedia);
	const cancelImport = useEditorStore((state) => state.cancelImport);
	const deleteAsset = useEditorStore((state) => state.deleteAsset);
	const renameAsset = useEditorStore((state) => state.renameAsset);
	const relinkAsset = useEditorStore((state) => state.relinkAsset);
	const setMediaView = useEditorStore((state) => state.setMediaView);
	const setMediaSearch = useEditorStore((state) => state.setMediaSearch);
	const selectAssets = useEditorStore((state) => state.selectAssets);
	const beginTimelineDrag = useEditorStore((state) => state.beginTimelineDrag);
	const cancelTimelineDrag = useEditorStore((state) => state.cancelTimelineDrag);
	const setProjectMessage = useEditorStore((state) => state.setProjectMessage);
	const revision = useEditorStore((state) => state.revision);
	const [isDragging, setIsDragging] = useState(false);
	const [storageBytes, setStorageBytes] = useState(0);
	const [proxyStorageBytes, setProxyStorageBytes] = useState(0);
	const [renamingId, setRenamingId] = useState<AssetId | null>(null);
	const [renameValue, setRenameValue] = useState('');
	const [deleteId, setDeleteId] = useState<AssetId | null>(null);
	const [relinkId, setRelinkId] = useState<AssetId | null>(null);
	const [relinkFile, setRelinkFile] = useState<File | null>(null);
	const [relinkMismatch, setRelinkMismatch] = useState('');
	const [isImporting, setIsImporting] = useState(false);
	const [activeAssetId, setActiveAssetId] = useState<AssetId | null>(null);
	const [thumbnailHeight, setThumbnailHeight] = useState(40);
	const [proxySettingsOpen, setProxySettingsOpen] = useState(false);
	const generateAssetDerived = useEditorStore((state) => state.generateAssetDerived);
	const createProxy = useEditorStore((state) => state.createProxy);
	const createAllProxies = useEditorStore((state) => state.createAllProxies);
	const deleteProxy = useEditorStore((state) => state.deleteProxy);
	const deleteAllProxies = useEditorStore((state) => state.deleteAllProxies);
	const retryProxyGeneration = useEditorStore((state) => state.retryProxyGeneration);
	const cancelProxyGeneration = useEditorStore((state) => state.cancelProxyGeneration);
	const setProjectProxySettings = useEditorStore((state) => state.setProjectProxySettings);
	const proxyDialogRef = useRef<HTMLDialogElement>(null);
	const fileInputRef = useRef<HTMLInputElement>(null);
	const relinkInputRef = useRef<HTMLInputElement>(null);
	const deleteDialogRef = useRef<HTMLDialogElement>(null);
	const relinkDialogRef = useRef<HTMLDialogElement>(null);
	const cardRefs = useRef(new Map<string, HTMLDivElement>());
	const lastDropAt = useRef(0);
	const selectionAnchor = useRef<AssetId | null>(null);
	const assets = useMemo(() => Object.values(project?.assets ?? {}), [project?.assets]);
	const filteredAssets = useMemo(() => {
		const needle = media.search.trim().toLocaleLowerCase();
		return assets.filter((asset) => !needle || asset.name.toLocaleLowerCase().includes(needle));
	}, [assets, media.search]);
	const pendingDelete = assets.find((asset) => asset.id === deleteId) ?? null;
	const hasImportFailures = media.importQueue.some((job) => job.status === 'failed');
	const pendingRelink = assets.find((asset) => asset.id === relinkId) ?? null;
	const deleteUsage = project && pendingDelete ? getAssetUsage(project, pendingDelete.id) : [];
	const rovingAssetId = filteredAssets.some((asset) => asset.id === activeAssetId)
		? activeAssetId
		: filteredAssets[0]?.id;

	useEffect(() => {
		if (!project) {
			setStorageBytes(0);
			setProxyStorageBytes(0);
			return;
		}
		let active = true;
		void projectMediaSize(project.id)
			.then((size) => {
				if (active) setStorageBytes(size);
			})
			.catch((error: unknown) => {
				if (active)
					setProjectMessage(
						`Could not read media storage usage: ${error instanceof Error ? error.message : 'Unknown storage error.'}`
					);
			});
		void projectProxyTotalSize(project.id)
			.then((size) => {
				if (active) setProxyStorageBytes(size);
			})
			.catch(() => {
				// Non-fatal if proxy size fails
			});
		return () => {
			active = false;
		};
	}, [project, assets.length, revision, setProjectMessage]);

	useEffect(() => {
		const dialog = deleteDialogRef.current;
		if (!dialog) return;
		if (pendingDelete && !dialog.open) dialog.showModal();
		if (!pendingDelete && dialog.open) dialog.close();
	}, [pendingDelete]);

	useEffect(() => {
		const dialog = relinkDialogRef.current;
		if (!dialog) return;
		if (pendingRelink && !dialog.open) dialog.showModal();
		if (!pendingRelink && dialog.open) dialog.close();
	}, [pendingRelink]);

	useEffect(() => {
		const dialog = proxyDialogRef.current;
		if (!dialog) return;
		if (proxySettingsOpen && !dialog.open) dialog.showModal();
		if (!proxySettingsOpen && dialog.open) dialog.close();
	}, [proxySettingsOpen]);

	async function importFiles(files: File[]): Promise<void> {
		if (!files.length || isImporting) return;
		setIsImporting(true);
		try {
			await importMedia(files);
		} finally {
			setIsImporting(false);
		}
	}

	async function pickFiles(): Promise<void> {
		try {
			const files = await openFiles(ACCEPTED_TYPES.join(','));
			await importFiles(files);
		} catch (error) {
			setProjectMessage(
				`Could not open the media picker: ${error instanceof Error ? error.message : 'Unknown file error.'}`
			);
		}
	}

	function dragEnter(event: DragEvent<HTMLElement>): void {
		event.preventDefault();
		setIsDragging(true);
	}

	function dragLeave(event: DragEvent<HTMLElement>): void {
		if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
		setIsDragging(false);
	}

	async function dropFiles(event: DragEvent<HTMLElement>): Promise<void> {
		event.preventDefault();
		setIsDragging(false);
		const now = Date.now();
		if (now - lastDropAt.current < 250) return;
		lastDropAt.current = now;
		const files = Array.from(event.dataTransfer.files);
		const entries = Array.from(event.dataTransfer.items)
			.map((item) => item.webkitGetAsEntry())
			.filter((entry): entry is FileSystemEntry => entry !== null);
		const nestedFiles = (await Promise.all(entries.map((entry) => filesFromEntry(entry)))).flat();
		const allFiles = nestedFiles.length ? nestedFiles : files;
		await importFiles(allFiles);
	}

	function startRename(asset: Asset): void {
		setRenamingId(asset.id);
		setRenameValue(asset.name);
	}

	function commitRename(assetId: AssetId): void {
		if (renameAsset(assetId, renameValue)) setRenamingId(null);
	}

	function selectAsset(
		assetId: AssetId,
		options: { toggle?: boolean; extend?: boolean } = {}
	): void {
		if (options.extend) {
			const anchorId = selectionAnchor.current ?? media.selectedAssetIds[0] ?? assetId;
			const anchorIndex = filteredAssets.findIndex((asset) => asset.id === anchorId);
			const targetIndex = filteredAssets.findIndex((asset) => asset.id === assetId);
			if (anchorIndex >= 0 && targetIndex >= 0) {
				const first = Math.min(anchorIndex, targetIndex);
				const last = Math.max(anchorIndex, targetIndex);
				selectAssets(filteredAssets.slice(first, last + 1).map((asset) => asset.id));
				return;
			}
		}
		if (options.toggle) {
			const selected = new Set(media.selectedAssetIds);
			if (selected.has(assetId)) selected.delete(assetId);
			else selected.add(assetId);
			selectionAnchor.current = assetId;
			selectAssets([...selected]);
			return;
		}
		selectionAnchor.current = assetId;
		selectAssets([assetId]);
	}

	function handleAssetKeyDown(event: KeyboardEvent<HTMLDivElement>, asset: Asset): void {
		if (event.target !== event.currentTarget) return;
		if (event.key === 'F2') {
			event.preventDefault();
			startRename(asset);
		} else if (event.key === ' ' || event.key === 'Spacebar') {
			event.preventDefault();
			selectAsset(asset.id, {
				toggle: event.ctrlKey || event.metaKey,
				extend: event.shiftKey
			});
		} else if (event.key === 'Delete' || event.key === 'Backspace') {
			event.preventDefault();
			setDeleteId(asset.id);
		} else if (event.key === 'ArrowDown' || event.key === 'ArrowRight') {
			event.preventDefault();
			const index = filteredAssets.findIndex((item) => item.id === asset.id);
			const next = filteredAssets[Math.min(index + 1, filteredAssets.length - 1)];
			if (next) {
				setActiveAssetId(next.id);
				if (event.shiftKey) selectAsset(next.id, { extend: true });
				else selectAsset(next.id);
				cardRefs.current.get(next.id)?.focus();
			}
		} else if (event.key === 'ArrowUp' || event.key === 'ArrowLeft') {
			event.preventDefault();
			const index = filteredAssets.findIndex((item) => item.id === asset.id);
			const previous = filteredAssets[Math.max(0, index - 1)];
			if (previous) {
				setActiveAssetId(previous.id);
				if (event.shiftKey) selectAsset(previous.id, { extend: true });
				else selectAsset(previous.id);
				cardRefs.current.get(previous.id)?.focus();
			}
		}
	}

	function dragAsset(event: DragEvent<HTMLDivElement>, asset: Asset): void {
		event.dataTransfer.setData('application/x-tfve-asset', asset.id);
		event.dataTransfer.effectAllowed = 'copy';
		beginTimelineDrag({
			kind: 'asset',
			clipIds: [],
			original: [],
			preview: [],
			pointerStartTime: 0,
			pointerTime: 0,
			assetId: asset.id,
			allowed: true,
			unlink: false
		});
	}

	function handleAssetClick(event: MouseEvent<HTMLDivElement>, assetId: AssetId): void {
		if (event.target instanceof HTMLElement && event.target.closest('button, input')) {
			return;
		}
		setActiveAssetId(assetId);
		selectAsset(assetId, {
			toggle: event.ctrlKey || event.metaKey,
			extend: event.shiftKey
		});
	}

	async function chooseRelinkFile(files: FileList | null): Promise<void> {
		const file = files?.item(0);
		if (!file || !pendingRelink) return;
		setRelinkFile(file);
		const result = await relinkAsset(pendingRelink.id, file);
		if (result.mismatch) setRelinkMismatch(result.mismatch);
		else if (result.relinked) closeRelink();
	}

	function closeRelink(): void {
		setRelinkId(null);
		setRelinkFile(null);
		setRelinkMismatch('');
		if (relinkInputRef.current) relinkInputRef.current.value = '';
	}

	async function confirmRelink(): Promise<void> {
		if (!pendingRelink || !relinkFile) return;
		const result = await relinkAsset(pendingRelink.id, relinkFile, { acceptMismatch: true });
		if (result.relinked) closeRelink();
	}

	async function removeSelectedAsset(force = false): Promise<void> {
		if (!pendingDelete) return;
		const result = await deleteAsset(pendingDelete.id, { force });
		if (result.deleted) setDeleteId(null);
	}

	return (
		<div
			className={`media-library ${isDragging ? 'is-drop-target' : ''}`}
			style={{ '--media-thumbnail-height': `${thumbnailHeight}px` } as CSSProperties}
			onDragEnter={dragEnter}
			onDragOver={(event) => event.preventDefault()}
			onDragLeave={dragLeave}
			onDrop={(event) => void dropFiles(event)}
			aria-busy={
				isImporting ||
				media.importQueue.some((job) => !['done', 'failed', 'cancelled'].includes(job.status))
			}
		>
			<div className="media-library-toolbar">
				<button
					className="secondary-button media-import-button"
					type="button"
					disabled={!project || isImporting}
					onClick={() => void pickFiles()}
				>
					Import Media…
				</button>
				<input
					ref={fileInputRef}
					type="file"
					name="media-files"
					accept={ACCEPTED_TYPES.join(',')}
					multiple
					hidden
					onChange={(event) => {
						void importFiles(Array.from(event.currentTarget.files ?? []));
						event.currentTarget.value = '';
					}}
				/>
				<div className="media-view-toggle" role="group" aria-label="Media view">
					<button
						type="button"
						aria-pressed={media.viewMode === 'list'}
						aria-label="List view"
						onClick={() => setMediaView('list')}
					>
						☷
					</button>
					<button
						type="button"
						aria-pressed={media.viewMode === 'grid'}
						aria-label="Grid view"
						onClick={() => setMediaView('grid')}
					>
						▦
					</button>
				</div>
				<button
					className="secondary-button media-proxy-settings-btn"
					type="button"
					disabled={!project}
					onClick={() => setProxySettingsOpen(true)}
					title="Configure video proxy resolution and auto generation"
					aria-label="Proxy settings"
				>
					Proxies…
				</button>
			</div>
			<label className="media-thumbnail-size">
				<span>Thumbnail height</span>
				<input
					type="range"
					name="media-thumbnail-height"
					min="40"
					max="160"
					step="8"
					value={thumbnailHeight}
					onChange={(event) => setThumbnailHeight(Number(event.currentTarget.value))}
				/>
				<output>{thumbnailHeight}px</output>
			</label>
			<label className="media-search">
				<span className="sr-only">Search media</span>
				<input
					type="search"
					name="media-search"
					autoComplete="off"
					placeholder="Search media…"
					value={media.search}
					onChange={(event) => setMediaSearch(event.currentTarget.value)}
				/>
			</label>
			<div className="media-column-heading">
				<span>Name</span>
				<span>Duration</span>
			</div>
			{!project ? (
				<div className="empty-state">
					<p>No project open</p>
					<span>Create or open a project before importing media.</span>
				</div>
			) : assets.length === 0 ? (
				<button className="media-drop-empty" type="button" onClick={() => void pickFiles()}>
					<span className="media-drop-icon" aria-hidden="true">
						⇧
					</span>
					<strong>Drop media files here</strong>
					<span>or choose files from this device</span>
					<small>{ACCEPTED_TYPES.join(' · ')}</small>
				</button>
			) : filteredAssets.length === 0 ? (
				<div className="empty-state">
					<p>No media matches “{media.search}”.</p>
				</div>
			) : (
				<div
					className={`media-assets media-assets-${media.viewMode}`}
					role="listbox"
					aria-label="Project media"
					aria-multiselectable="true"
				>
					{filteredAssets.map((asset) => {
						const selected = media.selectedAssetIds.includes(asset.id);
						const job = media.importQueue.find(
							(item) => item.name === asset.name && item.status !== 'done'
						);
						const status = media.derivedStatus[asset.id];
						return (
							<div
								key={asset.id}
								ref={(element) => {
									if (element) cardRefs.current.set(asset.id, element);
									else cardRefs.current.delete(asset.id);
								}}
								className={`media-asset ${selected ? 'is-selected' : ''}`}
								role="option"
								aria-selected={selected}
								aria-label={`${asset.name}, ${asset.kind}, ${timecode(asset, project.settings.fps)}`}
								tabIndex={asset.id === rovingAssetId ? 0 : -1}
								draggable
								onDragStart={(event) => dragAsset(event, asset)}
								onDragEnd={() => cancelTimelineDrag()}
								onClick={(event) => handleAssetClick(event, asset.id)}
								onFocus={() => setActiveAssetId(asset.id)}
								onKeyDown={(event) => handleAssetKeyDown(event, asset)}
							>
								<div className="media-asset-preview">
									<AssetPreview asset={asset} projectId={project.id} />
								</div>
								<div className="media-asset-details">
									{renamingId === asset.id ? (
										<form
											className="media-rename-form"
											onSubmit={(event) => {
												event.preventDefault();
												commitRename(asset.id);
											}}
										>
											<label className="sr-only" htmlFor={`media-rename-${asset.id}`}>
												Rename media
											</label>
											<input
												id={`media-rename-${asset.id}`}
												name="media-rename"
												autoComplete="off"
												value={renameValue}
												onChange={(event) => setRenameValue(event.currentTarget.value)}
												onKeyDown={(event) => {
													if (event.key === 'Escape') setRenamingId(null);
												}}
											/>
											<button className="sr-only" type="submit">
												Save name
											</button>
										</form>
									) : (
										<button
											className="media-asset-name"
											type="button"
											onClick={(event) =>
												selectAsset(asset.id, {
													toggle: event.ctrlKey || event.metaKey,
													extend: event.shiftKey
												})
											}
											onDoubleClick={() => startRename(asset)}
											title={`${asset.name} · F2 to rename`}
										>
											{asset.name}
										</button>
									)}
									<span className="media-asset-meta">
										{timecode(asset, project.settings.fps)}
										{asset.width && asset.height && ` · ${asset.width} × ${asset.height}`}
										{asset.fps && ` · ${asset.fps}${asset.fpsEstimated ? ' fps*' : ' fps'}`}
									</span>
									<div className="media-status-line">
										{asset.offline ? (
											<>
												<strong className="media-chip is-offline">Offline</strong>
												<button
													className="media-action-link"
													type="button"
													onClick={() => setRelinkId(asset.id)}
												>
													Relink…
												</button>
											</>
										) : status === 'queued' || status === 'working' ? (
											<span className="media-chip">Generating previews…</span>
										) : status === 'failed' ? (
											<>
												<span className="media-chip is-failed">Preview failed</span>
												<button
													className="media-action-link"
													type="button"
													onClick={() => generateAssetDerived(asset.id)}
												>
													Retry
												</button>
											</>
										) : asset.kind === 'video' && asset.audioChecked === false ? (
											<span
												className="media-chip is-failed"
												title="This browser could not inspect the container audio tracks; audio may be omitted."
											>
												Audio track unverified
											</span>
										) : null}
										{asset.kind === 'video' && !asset.offline && (
											<>
												{asset.proxy?.status === 'working' && (
													<span className="media-chip is-proxy" data-testid="proxy-status-working">
														Proxy {Math.round(asset.proxy.progress ?? 0)}%
														<button
															className="media-action-link"
															type="button"
															onClick={() => cancelProxyGeneration(asset.id)}
														>
															Cancel
														</button>
													</span>
												)}
												{asset.proxy?.status === 'queued' && (
													<span className="media-chip is-proxy" data-testid="proxy-status-queued">
														Proxy queued
														<button
															className="media-action-link"
															type="button"
															onClick={() => cancelProxyGeneration(asset.id)}
														>
															Cancel
														</button>
													</span>
												)}
												{asset.proxy?.status === 'ready' && (
													<span
														className="media-chip is-proxy-ready"
														data-testid="proxy-status-ready"
														title={`Proxy: ${asset.proxy.width}×${asset.proxy.height} (${formatBytes(asset.proxy.bytes ?? 0)})`}
													>
														Proxy ready ({asset.proxy.height}p)
														<button
															className="media-action-link"
															type="button"
															title="Delete proxy"
															onClick={() => void deleteProxy(asset.id)}
														>
															Delete
														</button>
													</span>
												)}
												{asset.proxy?.status === 'stale' && (
													<span className="media-chip is-failed" data-testid="proxy-status-stale">
														Proxy stale
														<button
															className="media-action-link"
															type="button"
															onClick={() => retryProxyGeneration(asset.id)}
														>
															Update
														</button>
													</span>
												)}
												{asset.proxy?.status === 'failed' && (
													<span
														className="media-chip is-failed"
														data-testid="proxy-status-failed"
														title={asset.proxy.error}
													>
														Proxy failed
														<button
															className="media-action-link"
															type="button"
															onClick={() => retryProxyGeneration(asset.id)}
														>
															Retry
														</button>
													</span>
												)}
												{(!asset.proxy || asset.proxy.status === 'none') && (
													<button
														className="media-action-link"
														type="button"
														data-testid="create-proxy-button"
														onClick={() => createProxy(asset.id)}
													>
														Create proxy
													</button>
												)}
											</>
										)}
									</div>
								</div>
								<div className="media-asset-actions">
									{asset.kind === 'video' &&
										!asset.offline &&
										(!asset.proxy || asset.proxy.status === 'none') && (
											<button
												type="button"
												aria-label={`Create proxy for ${asset.name}`}
												title="Create proxy"
												onClick={() => createProxy(asset.id)}
											>
												⚡
											</button>
										)}
									<button
										type="button"
										aria-label={`Rename ${asset.name}`}
										title="Rename (F2)"
										onClick={() => startRename(asset)}
									>
										✎
									</button>
									<button
										type="button"
										aria-label={`Delete ${asset.name}`}
										title="Delete"
										onClick={() => setDeleteId(asset.id)}
									>
										×
									</button>
								</div>
								{job &&
									job.status !== 'done' &&
									job.status !== 'failed' &&
									job.status !== 'cancelled' && (
										<div className="media-import-progress">
											<span>
												{job.status === 'probing'
													? 'Reading metadata…'
													: `Importing ${Math.round(job.progress)}%`}
											</span>
											<progress value={job.progress} max={100} aria-label={`Import ${job.name}`} />
										</div>
									)}
							</div>
						);
					})}
				</div>
			)}
			{media.importQueue.length > 0 && (
				<div className="media-import-queue" aria-label="Media import progress">
					{media.importQueue.map((job) => (
						<div className="media-import-job" key={job.id}>
							<span>{job.name}</span>
							<span>
								{job.status === 'probing'
									? 'Reading metadata…'
									: job.status === 'done'
										? 'Imported'
										: job.status === 'failed'
											? `Failed: ${job.reason}`
											: job.status === 'cancelled'
												? 'Cancelled'
												: `${Math.round(job.progress)}%`}
							</span>
							{!['done', 'failed', 'cancelled'].includes(job.status) && (
								<button
									type="button"
									aria-label={`Cancel import of ${job.name}`}
									onClick={() => cancelImport(job.id)}
								>
									Cancel
								</button>
							)}
						</div>
					))}
				</div>
			)}
			{hasImportFailures && (
				<div className="media-failures" role="status" aria-live="polite">
					{media.importQueue
						.filter((job) => job.status === 'failed')
						.map((job) => (
							<p key={job.id}>
								<strong>Failed:</strong> {job.name} — {job.reason}
							</p>
						))}
				</div>
			)}
			<div className="media-live" role="status" aria-live="polite">
				{projectMessage}
			</div>
			<footer className="media-library-footer">
				<span>
					{assets.length} {assets.length === 1 ? 'item' : 'items'}
				</span>
				<span>
					{formatBytes(storageBytes)} used
					{proxyStorageBytes > 0 && ` (${formatBytes(proxyStorageBytes)} proxies)`}
				</span>
			</footer>
			<dialog
				ref={deleteDialogRef}
				className="editor-dialog media-delete-dialog"
				aria-labelledby="media-delete-title"
				onCancel={(event) => {
					event.preventDefault();
					setDeleteId(null);
				}}
				onClick={(event: MouseEvent<HTMLDialogElement>) => {
					if (event.target === event.currentTarget) setDeleteId(null);
				}}
			>
				{pendingDelete && project && (
					<div className="dialog-content">
						<h2 id="media-delete-title">Delete “{pendingDelete.name}”?</h2>
						<p>
							{deleteUsage.length > 0
								? `Used by ${deleteUsage.length} clips on the timeline. Delete the asset and its clips? Undo keeps its media available for this session; unused media is cleaned when the project closes.`
								: 'This removes the asset from the project. Its media file and previews are safely cleaned up when the project is closed; undo keeps them available for this session.'}
						</p>
						<div className="dialog-actions">
							<button className="secondary-button" type="button" onClick={() => setDeleteId(null)}>
								Cancel
							</button>
							<button
								className="danger-button"
								type="button"
								onClick={() => void removeSelectedAsset(deleteUsage.length > 0)}
							>
								Delete media
							</button>
						</div>
					</div>
				)}
			</dialog>
			<dialog
				ref={relinkDialogRef}
				className="editor-dialog media-relink-dialog"
				aria-labelledby="media-relink-title"
				onCancel={(event) => {
					event.preventDefault();
					closeRelink();
				}}
				onClick={(event: MouseEvent<HTMLDialogElement>) => {
					if (event.target === event.currentTarget) closeRelink();
				}}
			>
				{pendingRelink && project && (
					<div className="dialog-content">
						<h2 id="media-relink-title">Relink “{pendingRelink.name}”</h2>
						<p>
							Select the original media file. Its type, size, and duration will be checked before
							relinking.
						</p>
						<label className="dialog-field">
							<span>Media file</span>
							<input
								ref={relinkInputRef}
								type="file"
								name="relink-file"
								accept={ACCEPTED_TYPES.join(',')}
								onChange={(event) => void chooseRelinkFile(event.currentTarget.files)}
							/>
						</label>
						{relinkMismatch && (
							<p className="dialog-message" role="alert">
								{relinkMismatch}
							</p>
						)}
						<div className="dialog-actions">
							<button className="secondary-button" type="button" onClick={closeRelink}>
								Cancel
							</button>
							{relinkMismatch && (
								<button
									className="danger-button"
									type="button"
									onClick={() => void confirmRelink()}
								>
									Relink Anyway
								</button>
							)}
						</div>
					</div>
				)}
			</dialog>
			<dialog
				ref={proxyDialogRef}
				className="editor-dialog media-proxy-dialog"
				aria-labelledby="media-proxy-title"
				onCancel={(event) => {
					event.preventDefault();
					setProxySettingsOpen(false);
				}}
				onClick={(event: MouseEvent<HTMLDialogElement>) => {
					if (event.target === event.currentTarget) setProxySettingsOpen(false);
				}}
			>
				{project && (
					<div className="dialog-content">
						<h2 id="media-proxy-title">Proxy Settings</h2>
						<p>
							Proxies are lower-resolution video files generated locally in your browser for
							smoother playback and scrubbing. Originals are always used for export and final
							output.
						</p>

						<div className="dialog-field">
							<label htmlFor="proxy-enabled-toggle">
								<input
									id="proxy-enabled-toggle"
									type="checkbox"
									checked={project.proxy?.enabled ?? false}
									onChange={(e) => setProjectProxySettings({ enabled: e.currentTarget.checked })}
								/>{' '}
								Use proxies in preview and timeline
							</label>
						</div>

						<div className="dialog-field">
							<label htmlFor="proxy-target-height">Proxy resolution (height)</label>
							<select
								id="proxy-target-height"
								value={project.proxy?.targetHeight ?? 540}
								onChange={(e) =>
									setProjectProxySettings({
										targetHeight: Number(e.currentTarget.value) as 360 | 540 | 720
									})
								}
							>
								<option value={360}>360p (Fastest, low memory)</option>
								<option value={540}>540p (Balanced, recommended)</option>
								<option value={720}>720p (High clarity)</option>
							</select>
						</div>

						<div className="dialog-field">
							<label htmlFor="proxy-auto-mode">Automatic proxy generation</label>
							<select
								id="proxy-auto-mode"
								value={project.proxy?.auto ?? 'large'}
								onChange={(e) =>
									setProjectProxySettings({
										auto: e.currentTarget.value as 'off' | 'large' | 'all'
									})
								}
							>
								<option value="large">Large media only (&gt;1080p or &gt;60fps)</option>
								<option value="all">All imported videos</option>
								<option value="off">Off (manual only)</option>
							</select>
						</div>

						<div className="media-proxy-dialog-stats">
							<span>
								Current proxy storage: <strong>{formatBytes(proxyStorageBytes)}</strong>
							</span>
						</div>

						<div className="dialog-actions">
							<button
								className="secondary-button"
								type="button"
								onClick={() => void createAllProxies()}
								title="Generate proxies for all video assets in this project"
							>
								Create All Proxies
							</button>
							<button
								className="danger-button"
								type="button"
								onClick={() => void deleteAllProxies()}
								title="Delete all generated proxies to free up local disk space"
							>
								Delete All Proxies
							</button>
							<button
								className="primary-button"
								type="button"
								onClick={() => setProxySettingsOpen(false)}
							>
								Done
							</button>
						</div>
					</div>
				)}
			</dialog>
		</div>
	);
}
