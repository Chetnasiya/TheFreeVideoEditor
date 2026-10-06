import AVFoundation
import CoreGraphics
import CoreVideo
import Foundation
import ImageIO

func writeWav(to url: URL, seconds: Double, sampleRate: Int = 44_100) throws {
	let sampleCount = Int(seconds * Double(sampleRate))
	let dataSize = sampleCount * 2
	var data = Data()
	func append<T: FixedWidthInteger>(_ value: T) {
		var littleEndian = value.littleEndian
		withUnsafeBytes(of: &littleEndian) { data.append(contentsOf: $0) }
	}
	data.append(contentsOf: Array("RIFF".utf8))
	append(UInt32(36 + dataSize))
	data.append(contentsOf: Array("WAVEfmt ".utf8))
	append(UInt32(16))
	append(UInt16(1))
	append(UInt16(1))
	append(UInt32(sampleRate))
	append(UInt32(sampleRate * 2))
	append(UInt16(2))
	append(UInt16(16))
	data.append(contentsOf: Array("data".utf8))
	append(UInt32(dataSize))
	for index in 0..<sampleCount {
		let time = Double(index) / Double(sampleRate)
		let sample = Int16(sin(2 * .pi * 440 * time) * 12_000)
		append(sample)
	}
	try data.write(to: url)
}

func createVideo(at url: URL) throws {
	let width = 160
	let height = 90
	let frameRate: Int32 = 30
	let frameCount = 90
	let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
	let input = AVAssetWriterInput(
		mediaType: .video,
		outputSettings: [
			AVVideoCodecKey: AVVideoCodecType.h264,
			AVVideoWidthKey: width,
			AVVideoHeightKey: height
		]
	)
	input.expectsMediaDataInRealTime = false
	let attributes: [String: Any] = [
		kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
		kCVPixelBufferWidthKey as String: width,
		kCVPixelBufferHeightKey as String: height,
		kCVPixelBufferCGImageCompatibilityKey as String: true,
		kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
	]
	let adaptor = AVAssetWriterInputPixelBufferAdaptor(
		assetWriterInput: input,
		sourcePixelBufferAttributes: attributes
	)
	guard writer.canAdd(input) else { throw NSError(domain: "Fixture", code: 1) }
	writer.add(input)
	guard writer.startWriting() else {
		throw writer.error ?? NSError(domain: "Fixture", code: 2)
	}
	writer.startSession(atSourceTime: .zero)
	for frame in 0..<frameCount {
		while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
		var optionalBuffer: CVPixelBuffer?
		guard CVPixelBufferPoolCreatePixelBuffer(
			kCFAllocatorDefault,
			adaptor.pixelBufferPool!,
			&optionalBuffer
		) == kCVReturnSuccess, let buffer = optionalBuffer else {
			throw NSError(domain: "Fixture", code: 3)
		}
		CVPixelBufferLockBaseAddress(buffer, [])
		if let baseAddress = CVPixelBufferGetBaseAddress(buffer) {
			let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
			let pixels = baseAddress.assumingMemoryBound(to: UInt8.self)
			for y in 0..<height {
				for x in 0..<width {
					let offset = y * rowBytes + x * 4
					pixels[offset] = 255
					pixels[offset + 1] = UInt8((x + frame) % 255)
					pixels[offset + 2] = UInt8((y * 2) % 255)
					pixels[offset + 3] = UInt8((x + y) % 255)
				}
			}
		}
		CVPixelBufferUnlockBaseAddress(buffer, [])
		guard adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(frame), timescale: frameRate)) else {
			throw writer.error ?? NSError(domain: "Fixture", code: 4)
		}
	}
	input.markAsFinished()
	let finished = DispatchSemaphore(value: 0)
	writer.finishWriting { finished.signal() }
	finished.wait()
	if writer.status != .completed {
		throw writer.error ?? NSError(domain: "Fixture", code: 5)
	}
}

func createStockVideo(at url: URL) throws {
	let width = 1920
	let height = 1080
	let frameRate: Int32 = 25
	let frameCount = 75
	let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
	let input = AVAssetWriterInput(
		mediaType: .video,
		outputSettings: [
			AVVideoCodecKey: AVVideoCodecType.h264,
			AVVideoWidthKey: width,
			AVVideoHeightKey: height,
			AVVideoCompressionPropertiesKey: [
				AVVideoAverageBitRateKey: 600_000,
				AVVideoMaxKeyFrameIntervalKey: 25,
				AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
			]
		]
	)
	input.expectsMediaDataInRealTime = false
	let attributes: [String: Any] = [
		kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
		kCVPixelBufferWidthKey as String: width,
		kCVPixelBufferHeightKey as String: height,
		kCVPixelBufferCGImageCompatibilityKey as String: true,
		kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
	]
	let adaptor = AVAssetWriterInputPixelBufferAdaptor(
		assetWriterInput: input,
		sourcePixelBufferAttributes: attributes
	)
	guard writer.canAdd(input) else { throw NSError(domain: "Fixture", code: 20) }
	writer.add(input)
	guard writer.startWriting() else {
		throw writer.error ?? NSError(domain: "Fixture", code: 21)
	}
	writer.startSession(atSourceTime: .zero)
	for frame in 0..<frameCount {
		while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
		var optionalBuffer: CVPixelBuffer?
		guard CVPixelBufferPoolCreatePixelBuffer(
			kCFAllocatorDefault,
			adaptor.pixelBufferPool!,
			&optionalBuffer
		) == kCVReturnSuccess, let buffer = optionalBuffer else {
			throw NSError(domain: "Fixture", code: 22)
		}
		CVPixelBufferLockBaseAddress(buffer, [])
		if let baseAddress = CVPixelBufferGetBaseAddress(buffer) {
			let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
			let pixels = baseAddress.assumingMemoryBound(to: UInt8.self)
			for y in 0..<height {
				for x in 0..<width {
					let offset = y * rowBytes + x * 4
					let gradient = (x + frame * 12) % 256
					let band = (y / 90 + frame / 5) % 2 == 0 ? 42 : 12
					pixels[offset] = 255
					pixels[offset + 1] = UInt8(gradient)
					pixels[offset + 2] = UInt8((y / 5 + frame * 2) % 256)
					pixels[offset + 3] = UInt8((gradient / 2 + band) % 256)
				}
			}
		}
		CVPixelBufferUnlockBaseAddress(buffer, [])
		guard adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(frame), timescale: frameRate)) else {
			throw writer.error ?? NSError(domain: "Fixture", code: 23)
		}
	}
	input.markAsFinished()
	let finished = DispatchSemaphore(value: 0)
	writer.finishWriting { finished.signal() }
	finished.wait()
	if writer.status != .completed {
		throw writer.error ?? NSError(domain: "Fixture", code: 24)
	}
}

func createColorVideo(at url: URL) throws {
	let width = 160
	let height = 90
	let frameRate: Int32 = 30
	let frameCount = 180
	let colors: [(UInt8, UInt8, UInt8)] = [
		(255, 0, 0),
		(0, 255, 0),
		(0, 0, 255),
		(255, 255, 0),
		(255, 0, 255),
		(0, 255, 255)
	]
	let writer = try AVAssetWriter(outputURL: url, fileType: .mov)
	let input = AVAssetWriterInput(
		mediaType: .video,
		outputSettings: [
			AVVideoCodecKey: AVVideoCodecType.h264,
			AVVideoWidthKey: width,
			AVVideoHeightKey: height,
			AVVideoCompressionPropertiesKey: [
				AVVideoAverageBitRateKey: 250_000,
				AVVideoMaxKeyFrameIntervalKey: 30,
				AVVideoProfileLevelKey: AVVideoProfileLevelH264BaselineAutoLevel
			]
		]
	)
	input.expectsMediaDataInRealTime = false
	let attributes: [String: Any] = [
		kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
		kCVPixelBufferWidthKey as String: width,
		kCVPixelBufferHeightKey as String: height,
		kCVPixelBufferCGImageCompatibilityKey as String: true,
		kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
	]
	let adaptor = AVAssetWriterInputPixelBufferAdaptor(
		assetWriterInput: input,
		sourcePixelBufferAttributes: attributes
	)
	guard writer.canAdd(input) else { throw NSError(domain: "Fixture", code: 11) }
	writer.add(input)
	guard writer.startWriting() else {
		throw writer.error ?? NSError(domain: "Fixture", code: 12)
	}
	writer.startSession(atSourceTime: .zero)
	for frame in 0..<frameCount {
		while !input.isReadyForMoreMediaData { Thread.sleep(forTimeInterval: 0.002) }
		var optionalBuffer: CVPixelBuffer?
		guard CVPixelBufferPoolCreatePixelBuffer(
			kCFAllocatorDefault,
			adaptor.pixelBufferPool!,
			&optionalBuffer
		) == kCVReturnSuccess, let buffer = optionalBuffer else {
			throw NSError(domain: "Fixture", code: 13)
		}
		CVPixelBufferLockBaseAddress(buffer, [])
		if let baseAddress = CVPixelBufferGetBaseAddress(buffer) {
			let color = colors[frame / Int(frameRate)]
			let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
			let pixels = baseAddress.assumingMemoryBound(to: UInt8.self)
			for y in 0..<height {
				for x in 0..<width {
					let offset = y * rowBytes + x * 4
					pixels[offset] = 255
					pixels[offset + 1] = color.0
					pixels[offset + 2] = color.1
					pixels[offset + 3] = color.2
				}
			}
		}
		CVPixelBufferUnlockBaseAddress(buffer, [])
		guard adaptor.append(buffer, withPresentationTime: CMTime(value: Int64(frame), timescale: frameRate)) else {
			throw writer.error ?? NSError(domain: "Fixture", code: 14)
		}
	}
	input.markAsFinished()
	let finished = DispatchSemaphore(value: 0)
	writer.finishWriting { finished.signal() }
	finished.wait()
	if writer.status != .completed {
		throw writer.error ?? NSError(domain: "Fixture", code: 15)
	}
}

func muxVideoAndAudio(videoURL: URL, audioURL: URL, outputURL: URL) throws {
	let videoAsset = AVURLAsset(url: videoURL)
	let audioAsset = AVURLAsset(url: audioURL)
	guard let sourceVideo = videoAsset.tracks(withMediaType: .video).first,
		let sourceAudio = audioAsset.tracks(withMediaType: .audio).first,
		let destination = AVMutableComposition().mutableCopy() as? AVMutableComposition
	else {
		throw NSError(domain: "Fixture", code: 6)
	}
	let duration = videoAsset.duration
	guard let video = destination.addMutableTrack(
		withMediaType: .video,
		preferredTrackID: kCMPersistentTrackID_Invalid
	), let audio = destination.addMutableTrack(
		withMediaType: .audio,
		preferredTrackID: kCMPersistentTrackID_Invalid
	) else {
		throw NSError(domain: "Fixture", code: 7)
	}
	try video.insertTimeRange(CMTimeRange(start: .zero, duration: duration), of: sourceVideo, at: .zero)
	try audio.insertTimeRange(
		CMTimeRange(start: .zero, duration: min(audioAsset.duration, duration)),
		of: sourceAudio,
		at: .zero
	)
	guard let exporter = AVAssetExportSession(
		asset: destination,
		presetName: AVAssetExportPresetHighestQuality
	) else {
		throw NSError(domain: "Fixture", code: 8)
	}
	exporter.outputURL = outputURL
	exporter.outputFileType = .mp4
	exporter.shouldOptimizeForNetworkUse = true
	let finished = DispatchSemaphore(value: 0)
	exporter.exportAsynchronously { finished.signal() }
	finished.wait()
	if exporter.status != .completed {
		throw exporter.error ?? NSError(domain: "Fixture", code: 9)
	}
}

func createPng(at url: URL) throws {
	let width = 96
	let height = 64
	guard let context = CGContext(
		data: nil,
		width: width,
		height: height,
		bitsPerComponent: 8,
		bytesPerRow: width * 4,
		space: CGColorSpaceCreateDeviceRGB(),
		bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue
	)
	else {
		throw NSError(domain: "Fixture", code: 10)
	}
	context.setFillColor(CGColor(red: 0.1, green: 0.6, blue: 0.9, alpha: 1))
	context.fill(CGRect(x: 0, y: 0, width: width, height: height))
	guard let image = context.makeImage(),
		let destination = CGImageDestinationCreateWithURL(
			url as CFURL,
			"public.png" as CFString,
			1,
			nil
		)
	else {
		throw NSError(domain: "Fixture", code: 10)
	}
	CGImageDestinationAddImage(destination, image, nil)
	guard CGImageDestinationFinalize(destination) else {
		throw NSError(domain: "Fixture", code: 11)
	}
}

let outputDirectory = URL(fileURLWithPath: CommandLine.arguments[1], isDirectory: true)
try FileManager.default.createDirectory(at: outputDirectory, withIntermediateDirectories: true)
let videoOnlyURL = outputDirectory.appendingPathComponent("video-only.mov")
let colorsVideoOnlyURL = outputDirectory.appendingPathComponent("colors-video-only.mov")
let toneURL = outputDirectory.appendingPathComponent("tone.wav")
let colorsToneURL = outputDirectory.appendingPathComponent("colors-tone.wav")
let sampleURL = outputDirectory.appendingPathComponent("sample.mp4")
let colorsURL = outputDirectory.appendingPathComponent("colors.mp4")
let stockVideoOnlyURL = outputDirectory.appendingPathComponent("stock-1080p25-noaudio.mp4")
let stockVideoSourceURL = outputDirectory.appendingPathComponent("stock-1080p25-source.mp4")
let stockAudioURL = outputDirectory.appendingPathComponent("stock-1080p25-audio.mp4")
let stillURL = outputDirectory.appendingPathComponent("still.png")
let overlayURL = outputDirectory.appendingPathComponent("overlay.png")
let brokenURL = outputDirectory.appendingPathComponent("bad.mp4")
try? FileManager.default.removeItem(at: videoOnlyURL)
try? FileManager.default.removeItem(at: colorsVideoOnlyURL)
try? FileManager.default.removeItem(at: sampleURL)
try? FileManager.default.removeItem(at: colorsURL)
try? FileManager.default.removeItem(at: stockVideoOnlyURL)
try? FileManager.default.removeItem(at: stockVideoSourceURL)
try? FileManager.default.removeItem(at: stockAudioURL)
try writeWav(to: toneURL, seconds: 3)
try writeWav(to: colorsToneURL, seconds: 6)
try createVideo(at: videoOnlyURL)
try createColorVideo(at: colorsVideoOnlyURL)
try createStockVideo(at: stockVideoOnlyURL)
try createStockVideo(at: stockVideoSourceURL)
try muxVideoAndAudio(videoURL: stockVideoSourceURL, audioURL: toneURL, outputURL: stockAudioURL)
try muxVideoAndAudio(videoURL: videoOnlyURL, audioURL: toneURL, outputURL: sampleURL)
try muxVideoAndAudio(videoURL: colorsVideoOnlyURL, audioURL: colorsToneURL, outputURL: colorsURL)
let colorsAttributes = try FileManager.default.attributesOfItem(atPath: colorsURL.path)
let colorsSize = (colorsAttributes[.size] as? NSNumber)?.intValue ?? Int.max
guard colorsSize <= 2_000_000 else {
	throw NSError(domain: "Fixture", code: 16, userInfo: [NSLocalizedDescriptionKey: "colors.mp4 exceeds 2 MB."])
}
try createPng(at: stillURL)
try createPng(at: overlayURL)
let sampleData = try Data(contentsOf: sampleURL)
try sampleData.prefix(128).write(to: brokenURL)
try? FileManager.default.removeItem(at: videoOnlyURL)
try? FileManager.default.removeItem(at: colorsVideoOnlyURL)
try? FileManager.default.removeItem(at: colorsToneURL)
try? FileManager.default.removeItem(at: stockVideoSourceURL)
for stockURL in [stockVideoOnlyURL, stockAudioURL] {
	let size = try FileManager.default.attributesOfItem(atPath: stockURL.path)[.size] as? NSNumber
	guard let size, size.intValue < 3_000_000 else {
		throw NSError(
			domain: "Fixture",
			code: 25,
			userInfo: [NSLocalizedDescriptionKey: "\(stockURL.lastPathComponent) exceeds 3 MB."]
		)
	}
}
