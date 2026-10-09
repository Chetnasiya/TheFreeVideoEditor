import AVFoundation
import CoreGraphics
import CoreVideo
import Foundation

func create4KFixture(at url: URL) throws {
	let width = 3840
	let height = 2160
	let frameRate: Int32 = 30
	let frameCount = 90 // 3 seconds at 30 fps
	let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
	let input = AVAssetWriterInput(
		mediaType: .video,
		outputSettings: [
			AVVideoCodecKey: AVVideoCodecType.h264,
			AVVideoWidthKey: width,
			AVVideoHeightKey: height,
			AVVideoCompressionPropertiesKey: [
				AVVideoAverageBitRateKey: 4_000_000, // 4 Mbps -> ~1.5 MB for 3s
				AVVideoMaxKeyFrameIntervalKey: 30,
				AVVideoProfileLevelKey: AVVideoProfileLevelH264MainAutoLevel
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
			let rowBytes = CVPixelBufferGetBytesPerRow(buffer)
			let pixels = baseAddress.assumingMemoryBound(to: UInt8.self)
			let shift = (frame * 4) % 256
			for y in 0..<height {
				let gradY = UInt8((y * 255) / height)
				let rowOffset = y * rowBytes
				for x in 0..<width {
					let gradX = UInt8(((x + shift) * 255) / (width + 256))
					let offset = rowOffset + x * 4
					pixels[offset] = 255     // A
					pixels[offset + 1] = gradX // R
					pixels[offset + 2] = gradY // G
					pixels[offset + 3] = 128   // B
				}
			}
		}
		CVPixelBufferUnlockBaseAddress(buffer, [])
		let presentationTime = CMTime(value: Int64(frame), timescale: frameRate)
		adaptor.append(buffer, withPresentationTime: presentationTime)
	}
	input.markAsFinished()
	let sema = DispatchSemaphore(value: 0)
	writer.finishWriting { sema.signal() }
	sema.wait()
}

let outputPath = CommandLine.arguments.count > 1 ? CommandLine.arguments[1] : "tests/fixtures/stock-4k.mp4"
let destURL = URL(fileURLWithPath: outputPath)
try? FileManager.default.removeItem(at: destURL)
try create4KFixture(at: destURL)
let attr = try FileManager.default.attributesOfItem(atPath: destURL.path)
let size = (attr[.size] as? NSNumber)?.intValue ?? 0
print("Generated 4K fixture at \(destURL.path) (\(size) bytes)")

