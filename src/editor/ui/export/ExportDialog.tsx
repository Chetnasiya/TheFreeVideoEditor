import { useEffect, useMemo, useRef, useState, type MouseEvent } from 'react';
import { timelineDuration, ticksToSeconds } from '../../core';
import type { Project } from '../../core';
import { serializeSrt } from '../../core/captions/srt';
import { serializeVtt } from '../../core/captions/vtt';
import type { ExportProgress } from '../../services/export/exporter';
import { getExportCapabilities, type EncoderSupport } from '../../services/export/capabilities';
import { registerProjectExport } from '../../services/export/session';
import { settingsForPreset, sanitizeFilename } from '../../services/export/presets';
import type { ExportQuality, ResolutionPreset } from '../../services/export/presets';
import type { ExportSettings } from '../../services/export/plan';
import type { InterchangeFormat, PackageProgress } from '../../services/interop/export';
import {
	createStreamingSaveTarget,
	supportsStreamingSave,
	saveFile
} from '../../services/storage/fileAccess';
import type { SaveFileType } from '../../services/storage/fileAccess';
import { useEditorStore, useEditorStoreApi } from '../../state/EditorProvider';
import './export-dialog.css';

type ExportTab = 'video' | 'project';
type ExportMode = 'webcodecs' | 'compatibility';
interface ExportRuntime {
	exportTimeline: typeof import('../../services/export/exporter').exportTimeline;
	ExportError: typeof import('../../services/export/exporter').ExportError;
	recordExportPath: typeof import('../../services/export/exporter').recordExportPath;
	exportWithMediaRecorder: typeof import('../../services/export/fallbackRecorder').exportWithMediaRecorder;
	exportInterchangeFile: typeof import('../../services/interop/export').exportInterchangeFile;
	streamInterchangePackage: typeof import('../../services/interop/export').streamInterchangePackage;
}

const INTERCHANGE_FORMATS: Array<{ value: InterchangeFormat; label: string }> = [
	{ value: 'xmeml', label: 'Premiere Pro XML (xmeml)' },
	{ value: 'edl', label: 'CMX3600 EDL' },
	{ value: 'fcpxml', label: 'Final Cut Pro XML' },
	{ value: 'otio', label: 'OpenTimelineIO' }
];
const INTERCHANGE_TYPES: Record<InterchangeFormat, SaveFileType[]> = {
	xmeml: [{ description: 'Premiere Pro XML', accept: { 'application/xml': ['.xml'] } }],
	edl: [{ description: 'CMX3600 EDL package', accept: { 'application/zip': ['.zip'] } }],
	fcpxml: [{ description: 'Final Cut Pro XML', accept: { 'application/xml': ['.fcpxml'] } }],
	otio: [{ description: 'OpenTimelineIO', accept: { 'application/json': ['.otio'] } }]
};
const LARGE_IN_MEMORY_EXPORT_BYTES = 512 * 1024 * 1024;

function makeVideoSettings(
	project: Project,
	options: {
		format: ExportSettings['format'];
		preset: ResolutionPreset;
		quality: ExportQuality;
		audio: boolean;
		filename: string;
	}
): ExportSettings {
	return settingsForPreset(project, options);
}

function errorText(error: unknown): string {
	return error instanceof Error ? error.message : 'The export could not be completed.';
}

function isAbortError(error: unknown): boolean {
	return error instanceof DOMException && error.name === 'AbortError';
}

function getProjectExportFilename(
	project: Project,
	format: InterchangeFormat,
	packageFile: boolean
): string {
	if (packageFile || format === 'edl') {
		return sanitizeFilename(project.name, 'zip');
	}
	const extension = format === 'xmeml' ? 'xml' : format;
	return sanitizeFilename(project.name, extension);
}

function interchangeFileTypes(format: InterchangeFormat, packageFile: boolean): SaveFileType[] {
	return packageFile
		? [{ description: 'Project interchange package', accept: { 'application/zip': ['.zip'] } }]
		: INTERCHANGE_TYPES[format];
}

export default function ExportDialog() {
	const open = useEditorStore((state) => state.isExportDialogOpen);
	const project = useEditorStore((state) => state.project);
	const editorStore = useEditorStoreApi();
	const close = useEditorStore((state) => state.closeExportDialog);
	const setExporting = useEditorStore((state) => state.setExporting);
	const repairAudioMetadata = useEditorStore((state) => state.repairAudioMetadata);
	const isClosePromptOpen = useEditorStore((state) => state.isExportClosePromptOpen);
	const dismissClosePrompt = useEditorStore((state) => state.dismissExportClosePrompt);
	const confirmCancelAndContinue = useEditorStore((state) => state.confirmCancelExportAndContinue);
	const [tab, setTab] = useState<ExportTab>('video');
	const [videoFormat, setVideoFormat] = useState<ExportSettings['format']>('mp4');
	const [preset, setPreset] = useState<ResolutionPreset>('project');
	const [quality, setQuality] = useState<ExportQuality>('high');
	const [includeAudio, setIncludeAudio] = useState(true);
	const [filename, setFilename] = useState('');
	const [mode, setMode] = useState<ExportMode>('webcodecs');
	const [interchangeFormat, setInterchangeFormat] = useState<InterchangeFormat>('xmeml');
	const [includeMedia, setIncludeMedia] = useState(true);
	const [exportSidecar, setExportSidecar] = useState(false);
	const [sidecarFormat, setSidecarFormat] = useState<'srt' | 'vtt'>('srt');
	const [offlineConfirmed, setOfflineConfirmed] = useState(false);
	const [capabilities, setCapabilities] = useState<EncoderSupport | null>(null);
	const [runtime, setRuntime] = useState<ExportRuntime | null>(null);
	const [progress, setProgress] = useState<ExportProgress | null>(null);
	const [packageProgress, setPackageProgress] = useState<PackageProgress | null>(null);
	const [isRunning, setIsRunning] = useState(false);
	const [cancelConfirmation, setCancelConfirmation] = useState(false);
	const [errorMessage, setErrorMessage] = useState('');
	const [notice, setNotice] = useState('');
	const dialogRef = useRef<HTMLDialogElement>(null);
	const closePromptRef = useRef<HTMLDialogElement>(null);
	const cancelDialogRef = useRef<HTMLDialogElement>(null);
	const errorRef = useRef<HTMLParagraphElement>(null);
	const cancelConfirmRef = useRef<HTMLButtonElement>(null);
	const cancelRef = useRef<AbortController | null>(null);

	const offlineAssets = useMemo(
		() => (project ? Object.values(project.assets).filter((asset) => asset.offline) : []),
		[project]
	);
	const undecodableAudioAssets = useMemo(() => {
		if (!project) return [];
		const scheduledAssets = new Set(
			project.tracks
				.filter((track) => track.kind === 'audio' && !track.muted)
				.flatMap((track) => track.clips.flatMap((clip) => (clip.assetId ? [clip.assetId] : [])))
		);
		return Object.values(project.assets).filter(
			(asset) => asset.hasAudio && asset.audioDecodable === false && scheduledAssets.has(asset.id)
		);
	}, [project]);
	const captionTracks = useMemo(
		() => (project ? project.tracks.filter((t) => t.kind === 'caption') : []),
		[project]
	);
	const settings = useMemo(
		() =>
			project
				? makeVideoSettings(project, {
						format: videoFormat,
						preset,
						quality,
						audio: includeAudio,
						filename: filename || project.name
					})
				: null,
		[filename, includeAudio, preset, project, quality, videoFormat]
	);
	const capabilityProjectId = project?.id;
	const capabilityFormat = settings?.format;
	const capabilityWidth = settings?.width;
	const capabilityHeight = settings?.height;
	const capabilityFps = settings?.fps;
	const capabilityAudio = settings?.audio;
	const durationSeconds = project ? ticksToSeconds(timelineDuration(project)) : 0;
	const estimatedSize = settings
		? Math.ceil(
				((settings.videoBitrate + (settings.audio ? settings.audioBitrate : 0)) * durationSeconds) /
					8
			)
		: 0;
	const warnAboutMemoryFallback =
		!supportsStreamingSave() && estimatedSize >= LARGE_IN_MEMORY_EXPORT_BYTES;

	const interchangeOmissionWarning = useMemo(() => {
		if (!project) return null;
		let effectsCount = 0;
		let adjustmentsCount = 0;
		let solidsCount = 0;
		let masksCount = 0;
		let transitionsCount = 0;
		let speedChangesCount = 0;
		for (const track of project.tracks) {
			if (track.transitions) {
				transitionsCount += track.transitions.length;
			}
			for (const clip of track.clips) {
				if (clip.effects && clip.effects.length > 0) {
					effectsCount += clip.effects.length;
				}
				if (clip.masks && clip.masks.length > 0) {
					masksCount += clip.masks.length;
				}
				if (clip.source?.type === 'adjustment') {
					adjustmentsCount += 1;
				}
				if (clip.source?.type === 'solid') {
					solidsCount += 1;
				}
				if (clip.speed !== 1 || clip.timeRemap) {
					speedChangesCount += 1;
				}
			}
		}
		if (
			effectsCount === 0 &&
			adjustmentsCount === 0 &&
			solidsCount === 0 &&
			masksCount === 0 &&
			transitionsCount === 0 &&
			speedChangesCount === 0
		)
			return null;
		const parts: string[] = [];
		if (masksCount > 0) {
			parts.push(`${masksCount} mask${masksCount === 1 ? '' : 's'}`);
		}
		if (effectsCount > 0) {
			parts.push(`${effectsCount} effect${effectsCount === 1 ? '' : 's'}`);
		}
		if (transitionsCount > 0) {
			parts.push(`${transitionsCount} transition${transitionsCount === 1 ? '' : 's'}`);
		}
		if (adjustmentsCount > 0) {
			parts.push(`${adjustmentsCount} adjustment layer${adjustmentsCount === 1 ? '' : 's'}`);
		}
		if (solidsCount > 0) {
			parts.push(`${solidsCount} solid color layer${solidsCount === 1 ? '' : 's'}`);
		}
		if (speedChangesCount > 0) {
			parts.push(`${speedChangesCount} speed change${speedChangesCount === 1 ? '' : 's'}`);
		}
		return `${parts.join(', ')} are not included in project files; use Video export to render them.`;
	}, [project]);
	const canExport = Boolean(
		project &&
		settings &&
		runtime &&
		durationSeconds > 0 &&
		(offlineAssets.length === 0 || offlineConfirmed) &&
		(!isRunning || tab !== 'video') &&
		(mode === 'webcodecs'
			? capabilities?.video && (!includeAudio || capabilities.audio)
			: videoFormat === 'webm' && capabilities?.compatibility)
	);

	useEffect(() => {
		const dialog = dialogRef.current;
		if (!dialog) return;
		if (open && !dialog.open) dialog.showModal();
		if (!open && dialog.open && !isRunning) dialog.close();
	}, [isRunning, open]);

	useEffect(() => {
		if (!open || runtime) return;
		let active = true;
		void Promise.all([
			import('../../services/export/exporter'),
			import('../../services/export/fallbackRecorder'),
			import('../../services/interop/export')
		])
			.then(([exporter, recorder, interop]) => {
				if (!active) return;
				setRuntime({
					exportTimeline: exporter.exportTimeline,
					ExportError: exporter.ExportError,
					recordExportPath: exporter.recordExportPath,
					exportWithMediaRecorder: recorder.exportWithMediaRecorder,
					exportInterchangeFile: interop.exportInterchangeFile,
					streamInterchangePackage: interop.streamInterchangePackage
				});
			})
			.catch((error: unknown) => {
				if (active) setErrorMessage(`Could not load export tools: ${errorText(error)}`);
			});
		return () => {
			active = false;
		};
	}, [open, runtime]);

	useEffect(() => {
		const dialog = closePromptRef.current;
		if (!dialog) return;
		if (isClosePromptOpen && !dialog.open) dialog.showModal();
		if (!isClosePromptOpen && dialog.open) dialog.close();
	}, [isClosePromptOpen]);

	useEffect(() => {
		if (
			!open ||
			!capabilityProjectId ||
			!capabilityFormat ||
			!capabilityWidth ||
			!capabilityHeight ||
			!capabilityFps ||
			capabilityAudio === undefined
		)
			return;
		let active = true;
		setCapabilities(null);
		void getExportCapabilities({
			format: capabilityFormat,
			width: capabilityWidth,
			height: capabilityHeight,
			fps: capabilityFps,
			audio: capabilityAudio
		})
			.then((result) => {
				if (!active) return;
				setCapabilities(result);
				setMode(result.video ? 'webcodecs' : 'compatibility');
			})
			.catch((error: unknown) => {
				if (active) setErrorMessage(`Could not check browser export support: ${errorText(error)}`);
			});
		return () => {
			active = false;
		};
	}, [
		open,
		capabilityProjectId,
		capabilityAudio,
		capabilityFormat,
		capabilityFps,
		capabilityHeight,
		capabilityWidth
	]);

	useEffect(() => {
		if (!open || !project) return;
		setFilename(project.name);
		setOfflineConfirmed(offlineAssets.length === 0);
		setProgress(null);
		setPackageProgress(null);
		setErrorMessage('');
		setNotice('');
	}, [offlineAssets.length, open, project]);

	useEffect(() => {
		if (errorMessage) errorRef.current?.focus();
	}, [errorMessage]);

	useEffect(() => {
		const dialog = cancelDialogRef.current;
		if (!dialog) return;
		if (cancelConfirmation && !dialog.open) {
			dialog.showModal();
			cancelConfirmRef.current?.focus();
		}
		if (!cancelConfirmation && dialog.open) dialog.close();
	}, [cancelConfirmation]);

	function updateFormat(format: ExportSettings['format']): void {
		setVideoFormat(format);
		setErrorMessage('');
	}

	async function runVideoExport(): Promise<void> {
		if (!project || !settings || !runtime || isRunning) return;
		const exportRuntime = runtime;
		const controller = new AbortController();
		cancelRef.current = controller;
		let unregister: (() => void) | null = null;
		let fallbackNotice = '';
		const exportWarnings: string[] = [];
		setIsRunning(true);
		setExporting(true);
		setErrorMessage('');
		setNotice('');
		setProgress(null);
		try {
			const audioRepair = await repairAudioMetadata();
			if (audioRepair.warnings.length > 0) {
				exportWarnings.push(...audioRepair.warnings);
				setNotice(audioRepair.warnings.join(' '));
			}
			const currentProject = audioRepair.project ?? editorStore.getState().project;
			if (!currentProject) throw new Error('The project closed before export could start.');
			const snapshot = structuredClone(currentProject);
			unregister = registerProjectExport(snapshot.id, controller);
			if (mode === 'compatibility') {
				exportRuntime.recordExportPath('compatibility');
				const types: SaveFileType[] = [
					{ description: 'WebM video', accept: { 'video/webm': ['.webm'] } }
				];
				const saveTarget = await createStreamingSaveTarget(
					settings.filename.replace(/\.[^.]+$/, '.webm'),
					types
				);
				if (controller.signal.aborted) throw new DOMException('Export cancelled.', 'AbortError');
				const result = await exportRuntime.exportWithMediaRecorder(snapshot, settings, {
					signal: controller.signal,
					onProgress: setProgress,
					onWarning: (warning) => exportWarnings.push(warning)
				});
				if (saveTarget) {
					try {
						await saveTarget.write(new Uint8Array(await result.blob.arrayBuffer()));
						await saveTarget.close();
					} catch (error) {
						await saveTarget.abort(error);
						throw error;
					}
				} else {
					await saveFile(result.blob, result.filename, types);
				}

				if (exportSidecar && captionTracks.length > 0) {
					const activeCapTrack = captionTracks[0];
					if (activeCapTrack && activeCapTrack.captions && activeCapTrack.captions.length > 0) {
						const subContent =
							sidecarFormat === 'vtt'
								? serializeVtt(activeCapTrack.captions)
								: serializeSrt(activeCapTrack.captions);
						const subBlob = new Blob([subContent], {
							type: sidecarFormat === 'vtt' ? 'text/vtt;charset=utf-8' : 'text/plain;charset=utf-8'
						});
						const subFilename = settings.filename.replace(/\.[^.]+$/, `.${sidecarFormat}`);
						await saveFile(subBlob, subFilename, [
							{
								description:
									sidecarFormat === 'vtt' ? 'WebVTT Subtitles (*.vtt)' : 'SubRip Subtitles (*.srt)',
								accept: {
									[sidecarFormat === 'vtt' ? 'text/vtt' : 'text/plain']: [`.${sidecarFormat}`]
								}
							}
						]);
					}
				}
				setNotice(
					[
						'Compatibility export uses real-time browser recording. Some frames may be dropped on slower devices.',
						...exportWarnings
					].join(' ')
				);
				return;
			}
			const result = await exportRuntime.exportTimeline(snapshot, settings, {
				signal: controller.signal,
				onProgress: setProgress,
				onWarning: (warning) => exportWarnings.push(warning),
				onFallback: (reason) => {
					fallbackNotice = reason;
					setNotice(reason);
				},
				...(capabilities?.codec ? { videoCodec: capabilities.codec } : {}),
				...(includeAudio && capabilities?.audioCodec ? { audioCodec: capabilities.audioCodec } : {})
			});
			if (result.blob) {
				const types: SaveFileType[] = [
					{
						description: videoFormat === 'mp4' ? 'MP4 video' : 'WebM video',
						accept: {
							[videoFormat === 'mp4' ? 'video/mp4' : 'video/webm']: [`.${videoFormat}`]
						}
					}
				];
				await saveFile(result.blob, settings.filename, types);
			}

			if (exportSidecar && captionTracks.length > 0) {
				const activeCapTrack = captionTracks[0];
				if (activeCapTrack && activeCapTrack.captions && activeCapTrack.captions.length > 0) {
					const subContent =
						sidecarFormat === 'vtt'
							? serializeVtt(activeCapTrack.captions)
							: serializeSrt(activeCapTrack.captions);
					const subBlob = new Blob([subContent], {
						type: sidecarFormat === 'vtt' ? 'text/vtt;charset=utf-8' : 'text/plain;charset=utf-8'
					});
					const subFilename = settings.filename.replace(/\.[^.]+$/, `.${sidecarFormat}`);
					await saveFile(subBlob, subFilename, [
						{
							description:
								sidecarFormat === 'vtt' ? 'WebVTT Subtitles (*.vtt)' : 'SubRip Subtitles (*.srt)',
							accept: {
								[sidecarFormat === 'vtt' ? 'text/vtt' : 'text/plain']: [`.${sidecarFormat}`]
							}
						}
					]);
				}
			}
			const completionNotice =
				result.path === 'main-webcodecs'
					? `${videoFormat.toUpperCase()} export complete. ${fallbackNotice || 'The yielding main-thread encoder was used; the editor may respond more slowly.'}`
					: `${videoFormat.toUpperCase()} video export complete.`;
			setNotice([completionNotice, ...exportWarnings].join(' '));
		} catch (error) {
			if (
				isAbortError(error) ||
				(error instanceof exportRuntime.ExportError && error.code === 'CANCELLED')
			) {
				setNotice('Export cancelled. No output file was saved.');
			} else {
				setErrorMessage(errorText(error));
			}
		} finally {
			unregister?.();
			cancelRef.current = null;
			setExporting(false);
			setIsRunning(false);
			setCancelConfirmation(false);
			setProgress(null);
		}
	}

	async function runInterchangeExport(): Promise<void> {
		if (!project || !runtime || isRunning) return;
		const exportRuntime = runtime;
		const snapshot = structuredClone(project);
		const controller = new AbortController();
		cancelRef.current = controller;
		let unregister: (() => void) | null = null;
		const packageFile = includeMedia || interchangeFormat === 'edl';
		const suggestedName = getProjectExportFilename(snapshot, interchangeFormat, packageFile);
		setIsRunning(true);
		setExporting(true);
		setErrorMessage('');
		setNotice('');
		setPackageProgress(null);
		try {
			unregister = registerProjectExport(snapshot.id, controller);
			if (packageFile) {
				const target = await createStreamingSaveTarget(
					suggestedName,
					interchangeFileTypes(interchangeFormat, packageFile)
				);
				if (target) {
					try {
						await exportRuntime.streamInterchangePackage(
							snapshot,
							interchangeFormat,
							(chunk) => target.write(chunk),
							{
								includeMedia,
								signal: controller.signal,
								onProgress: setPackageProgress
							}
						);
						await target.close();
					} catch (error) {
						await target.abort(error);
						throw error;
					}
				} else {
					const chunks: Uint8Array[] = [];
					await exportRuntime.streamInterchangePackage(
						snapshot,
						interchangeFormat,
						async (chunk) => {
							chunks.push(chunk.slice());
						},
						{
							includeMedia,
							signal: controller.signal,
							onProgress: setPackageProgress
						}
					);
					const blob = new Blob(
						chunks.map((chunk) => Uint8Array.from(chunk).buffer),
						{
							type: 'application/zip'
						}
					);
					await saveFile(blob, suggestedName, interchangeFileTypes(interchangeFormat, packageFile));
				}
			} else {
				const contents = exportRuntime.exportInterchangeFile(snapshot, interchangeFormat);
				const mimeType = interchangeFormat === 'otio' ? 'application/json' : 'application/xml';
				await saveFile(
					new Blob([contents], { type: `${mimeType};charset=utf-8` }),
					suggestedName,
					interchangeFileTypes(interchangeFormat, false)
				);
			}
			setNotice(
				`${INTERCHANGE_FORMATS.find((item) => item.value === interchangeFormat)?.label ?? 'Project'} export complete.`
			);
		} catch (error) {
			if (isAbortError(error)) setNotice('Export cancelled. No output file was saved.');
			else setErrorMessage(errorText(error));
		} finally {
			unregister?.();
			cancelRef.current = null;
			setExporting(false);
			setIsRunning(false);
			setCancelConfirmation(false);
			setPackageProgress(null);
		}
	}

	function requestCancel(): void {
		if (isRunning) setCancelConfirmation(true);
		else close();
	}

	const progressValue =
		tab === 'video'
			? progress
				? { value: progress.percent, label: `${progress.percent}%` }
				: null
			: packageProgress
				? {
						value: packageProgress.totalFiles
							? Math.round((packageProgress.filesDone / packageProgress.totalFiles) * 100)
							: 0,
						label: `${packageProgress.filesDone} of ${packageProgress.totalFiles} files`
					}
				: null;

	return (
		<>
			<dialog
				ref={dialogRef}
				className="editor-dialog export-dialog"
				aria-labelledby="export-dialog-title"
				onCancel={(event) => {
					event.preventDefault();
					requestCancel();
				}}
				onClick={(event: MouseEvent<HTMLDialogElement>) => {
					if (event.target === event.currentTarget && !isRunning) close();
				}}
			>
				<div className="dialog-content">
					<div className="dialog-heading">
						<div>
							<p className="dialog-eyebrow">DELIVER</p>
							<h2 id="export-dialog-title">Export</h2>
						</div>
						<button
							className="icon-button dialog-close"
							type="button"
							aria-label={isRunning ? 'Request export cancellation' : 'Close export dialog'}
							onClick={requestCancel}
						>
							×
						</button>
					</div>
					<div className="export-tabs" role="tablist" aria-label="Export type">
						<button
							type="button"
							role="tab"
							aria-selected={tab === 'video'}
							tabIndex={tab === 'video' ? 0 : -1}
							aria-controls="video-export-panel"
							onKeyDown={(event) => {
								if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
								event.preventDefault();
								const nextTab = event.key === 'ArrowRight' ? 'project' : 'video';
								setTab(nextTab);
								event.currentTarget.parentElement
									?.querySelector<HTMLButtonElement>(`[data-export-tab="${nextTab}"]`)
									?.focus();
							}}
							data-export-tab="video"
							onClick={() => setTab('video')}
						>
							Video
						</button>
						<button
							type="button"
							role="tab"
							aria-selected={tab === 'project'}
							tabIndex={tab === 'project' ? 0 : -1}
							aria-controls="project-export-panel"
							onKeyDown={(event) => {
								if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
								event.preventDefault();
								const nextTab = event.key === 'ArrowRight' ? 'video' : 'project';
								setTab(nextTab);
								event.currentTarget.parentElement
									?.querySelector<HTMLButtonElement>(`[data-export-tab="${nextTab}"]`)
									?.focus();
							}}
							data-export-tab="project"
							onClick={() => setTab('project')}
						>
							Project file
						</button>
					</div>
					{!runtime && !errorMessage && (
						<p className="export-capability" role="status" aria-live="polite">
							Loading export tools…
						</p>
					)}
					{tab === 'video' ? (
						<div id="video-export-panel" role="tabpanel" className="export-form">
							<label className="dialog-field">
								<span>Format</span>
								<select
									value={videoFormat}
									disabled={isRunning}
									onChange={(event) =>
										updateFormat(event.currentTarget.value as ExportSettings['format'])
									}
								>
									<option value="mp4">MP4 · H.264 + AAC</option>
									<option value="webm">WebM · VP9 + Opus</option>
								</select>
							</label>
							<label className="dialog-field">
								<span>Resolution</span>
								<select
									value={preset}
									disabled={isRunning}
									onChange={(event) => setPreset(event.currentTarget.value as ResolutionPreset)}
								>
									<option value="project">
										Project · {project?.settings.width} × {project?.settings.height}
									</option>
									<option value="1080p">1080p</option>
									<option value="720p">720p</option>
									<option value="480p">480p</option>
								</select>
							</label>
							<label className="dialog-field">
								<span>Quality</span>
								<select
									value={quality}
									disabled={isRunning}
									onChange={(event) => setQuality(event.currentTarget.value as ExportQuality)}
								>
									<option value="high">High</option>
									<option value="medium">Standard</option>
									<option value="low">Smaller file</option>
								</select>
							</label>
							<label className="dialog-field">
								<span>File name</span>
								<input
									name="export-filename"
									value={filename}
									disabled={isRunning}
									maxLength={120}
									autoComplete="off"
									onChange={(event) => setFilename(event.currentTarget.value)}
								/>
							</label>
							{capabilities && mode === 'webcodecs' && includeAudio && !capabilities.audio && (
								<p className="export-warning" role="status">
									Audio encoding is unavailable for this format here. Turn off “Include audio” or
									choose another format.
								</p>
							)}
							{includeAudio &&
								undecodableAudioAssets.map((asset) => (
									<p className="export-warning" role="status" key={asset.id}>
										Audio from “{asset.name}” will be skipped because this browser cannot decode its
										codec.
									</p>
								))}
							<label className="export-checkbox">
								<input
									type="checkbox"
									checked={includeAudio}
									disabled={isRunning}
									onChange={(event) => setIncludeAudio(event.currentTarget.checked)}
								/>
								<span>Include audio</span>
							</label>
							{captionTracks.length > 0 && (
								<div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
									<label className="export-checkbox">
										<input
											type="checkbox"
											checked={exportSidecar}
											disabled={isRunning}
											onChange={(event) => setExportSidecar(event.currentTarget.checked)}
										/>
										<span>Export sidecar subtitle file</span>
									</label>
									{exportSidecar && (
										<label className="dialog-field" style={{ marginLeft: '24px' }}>
											<span>Subtitle format</span>
											<select
												value={sidecarFormat}
												disabled={isRunning}
												onChange={(e) => setSidecarFormat(e.currentTarget.value as 'srt' | 'vtt')}
											>
												<option value="srt">SubRip (.srt)</option>
												<option value="vtt">WebVTT (.vtt)</option>
											</select>
										</label>
									)}
								</div>
							)}
							<div className="export-capability" role="status" aria-live="polite">
								{capabilities === null ? (
									'Checking browser export support…'
								) : capabilities.video ? (
									<>
										WebCodecs available
										{includeAudio && !capabilities.audio ? ' · audio encoding unavailable' : ''}
										{capabilities.codec ? ` · ${capabilities.codec}` : ''}
									</>
								) : (
									<>
										{capabilities.reason || 'WebCodecs is unavailable.'}
										{capabilities.compatibility
											? ' Use compatibility mode for real-time WebM recording.'
											: ' This browser cannot export video.'}
									</>
								)}
							</div>
							{capabilities && (
								<label className="dialog-field">
									<span>Export method</span>
									<select
										value={mode}
										disabled={isRunning}
										onChange={(event) => setMode(event.currentTarget.value as ExportMode)}
									>
										<option value="webcodecs" disabled={!capabilities.video}>
											WebCodecs · frame-accurate
										</option>
										<option
											value="compatibility"
											disabled={!capabilities.compatibility || videoFormat !== 'webm'}
										>
											Compatibility · real-time WebM
										</option>
									</select>
								</label>
							)}
							<p className="export-estimate">
								{durationSeconds > 0
									? `${Math.floor(durationSeconds / 60)}:${String(Math.floor(durationSeconds % 60)).padStart(2, '0')} · approximately ${Math.max(1, Math.round(estimatedSize / 1_000_000))} MB`
									: 'Add clips to the timeline before exporting.'}
							</p>
							{warnAboutMemoryFallback && (
								<p className="export-warning" role="status">
									This browser cannot stream the estimated {Math.ceil(estimatedSize / 1_000_000)} MB
									export to disk. The output will be buffered in memory and may exceed available
									memory.
								</p>
							)}
							{offlineAssets.length > 0 && (
								<div className="export-warning" role="group" aria-label="Offline media warning">
									<p>
										{offlineAssets.length} media asset(s) are offline. Those portions of the
										exported video will be blank or silent.
									</p>
									<label className="export-checkbox">
										<input
											type="checkbox"
											checked={offlineConfirmed}
											disabled={isRunning}
											onChange={(event) => setOfflineConfirmed(event.currentTarget.checked)}
										/>
										<span>Continue without offline media</span>
									</label>
								</div>
							)}
						</div>
					) : (
						<div id="project-export-panel" role="tabpanel" className="export-form">
							<label className="dialog-field">
								<span>Format</span>
								<select
									value={interchangeFormat}
									disabled={isRunning}
									onChange={(event) =>
										setInterchangeFormat(event.currentTarget.value as InterchangeFormat)
									}
								>
									{INTERCHANGE_FORMATS.map((format) => (
										<option key={format.value} value={format.value}>
											{format.label}
										</option>
									))}
								</select>
							</label>
							<label className="export-checkbox">
								<input
									type="checkbox"
									checked={includeMedia}
									disabled={isRunning}
									onChange={(event) => setIncludeMedia(event.currentTarget.checked)}
								/>
								<span>Package project with media files (.zip)</span>
							</label>
							<p className="dialog-description">
								Premiere Pro imports xmeml and EDL. Final Cut Pro XML targets Final Cut Pro and
								Resolve. OTIO is an open interchange format. Media is referenced by package-relative
								paths when included; relink it if you move files.
							</p>
							{interchangeFormat === 'edl' && (
								<p className="export-warning" role="note">
									CMX3600 EDL contains cuts for video tracks only. The package contains one EDL per
									video track; audio is not included.
								</p>
							)}
							{includeMedia && offlineAssets.length > 0 && (
								<p className="export-warning" role="alert">
									Cannot package {offlineAssets.length} offline media asset(s). Relink them or turn
									off media packaging.
								</p>
							)}
							{interchangeOmissionWarning && (
								<p className="export-warning" role="note">
									{interchangeOmissionWarning}
								</p>
							)}
						</div>
					)}
					{progressValue && (
						<div className="export-progress" role="status" aria-live="polite">
							<div className="export-progress-label">
								<span>{isRunning ? 'Exporting…' : 'Export complete'}</span>
								<span>{progressValue.label}</span>
							</div>
							<progress max={100} value={progressValue.value} aria-label="Export progress" />
							{progress && (
								<p>
									{progress.framesDone} / {progress.totalFrames} frames
									{progress.phase === 'rendering' ? ` · ${progress.fps.toFixed(1)} fps` : ''}
								</p>
							)}
						</div>
					)}
					{errorMessage && (
						<p ref={errorRef} className="dialog-message" role="alert" tabIndex={-1}>
							{errorMessage}
						</p>
					)}
					{notice && (
						<p className="export-notice" role="status" aria-live="polite">
							{notice}
						</p>
					)}
					<div className="dialog-actions">
						<button
							ref={cancelConfirmRef}
							className="secondary-button"
							type="button"
							onClick={requestCancel}
						>
							{isRunning ? 'Cancel…' : 'Close'}
						</button>
						<button
							className="primary-button"
							type="button"
							disabled={
								isRunning ||
								(tab === 'video'
									? !canExport
									: !runtime || !project || (includeMedia && offlineAssets.length > 0))
							}
							onClick={() => void (tab === 'video' ? runVideoExport() : runInterchangeExport())}
						>
							{isRunning ? 'Exporting…' : tab === 'video' ? 'Export video' : 'Export project'}
						</button>
					</div>
				</div>
			</dialog>
			<dialog
				ref={cancelDialogRef}
				className="editor-dialog export-confirm-dialog"
				aria-labelledby="cancel-export-title"
				aria-describedby="cancel-export-description"
				onCancel={(event) => {
					event.preventDefault();
					setCancelConfirmation(false);
				}}
			>
				<div className="dialog-content">
					<h2 id="cancel-export-title">Cancel this export?</h2>
					<p id="cancel-export-description" className="dialog-description">
						The current output will be discarded.
					</p>
					<div className="dialog-actions">
						<button
							ref={cancelConfirmRef}
							className="secondary-button"
							type="button"
							onClick={() => setCancelConfirmation(false)}
						>
							Keep exporting
						</button>
						<button
							className="danger-button"
							type="button"
							onClick={() => cancelRef.current?.abort()}
						>
							Cancel export
						</button>
					</div>
				</div>
			</dialog>
			<dialog
				ref={closePromptRef}
				className="editor-dialog export-close-dialog"
				aria-labelledby="export-close-title"
				onCancel={(event) => {
					event.preventDefault();
					dismissClosePrompt();
				}}
			>
				<div className="dialog-content">
					<h2 id="export-close-title">Export in progress</h2>
					<p className="dialog-description">
						Cancel the active export before closing or switching projects? Its output will be
						discarded.
					</p>
					<div className="dialog-actions">
						<button className="secondary-button" type="button" onClick={dismissClosePrompt}>
							Keep exporting
						</button>
						<button
							className="danger-button"
							type="button"
							onClick={() => void confirmCancelAndContinue()}
						>
							Cancel export and continue
						</button>
					</div>
				</div>
			</dialog>
		</>
	);
}
