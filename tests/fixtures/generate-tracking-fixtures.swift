import Foundation
import AVFoundation
import CoreGraphics
import CoreVideo

struct TargetGroundTruth: Codable {
    let frame: Int
    let timeUs: Int64
    let x: Double
    let y: Double
    let rotation: Double
    let scale: Double
    let occluded: Bool
}

struct ShakeGroundTruth: Codable {
    let frame: Int
    let timeUs: Int64
    let dx: Double
    let dy: Double
    let rotation: Double
}

func createTrackTargetVideo(url: URL, jsonUrl: URL) throws {
    let width = 640
    let height = 360
    let fps: Int32 = 30
    let totalFrames = 90
    
    var groundTruths: [TargetGroundTruth] = []
    
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: 1_200_000,
            AVVideoProfileLevelKey: AVVideoProfileLevelH264HighAutoLevel
        ]
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    
    let attributes: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferCGImageCompatibilityKey as String: true,
        kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attributes)
    
    writer.add(input)
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)
    
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    
    for f in 0..<totalFrames {
        let timeUs = Int64(Double(f) / Double(fps) * 1_000_000)
        
        // Ground truth trajectory
        // Frame 0-35: smooth motion, 36-45: occluded, 46-90: re-emerges and moves
        let occluded = (f >= 36 && f <= 45)
        let t = Double(f) / Double(totalFrames)
        let normX = 0.35 + 0.3 * sin(t * .pi * 2.5)
        let normY = 0.4 + 0.2 * cos(t * .pi * 2.0)
        let rot = 0.2 * sin(t * .pi * 3.0)
        let scale = 1.0 + 0.15 * cos(t * .pi * 2.0)
        
        groundTruths.append(TargetGroundTruth(
            frame: f,
            timeUs: timeUs,
            x: normX,
            y: normY,
            rotation: rot,
            scale: scale,
            occluded: occluded
        ))
        
        var maybeBuffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, adaptor.pixelBufferPool!, &maybeBuffer)
        guard let pixelBuffer = maybeBuffer else { break }
        
        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        let context = CGContext(
            data: CVPixelBufferGetBaseAddress(pixelBuffer),
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
        )!
        
        // Background texture: grid pattern with noise
        context.setFillColor(CGColor(red: 0.25, green: 0.28, blue: 0.32, alpha: 1.0))
        context.fill(CGRect(x: 0, y: 0, width: width, height: height))
        
        context.setStrokeColor(CGColor(red: 0.35, green: 0.38, blue: 0.42, alpha: 1.0))
        context.setLineWidth(2.0)
        for x in stride(from: 0, to: width, by: 32) {
            context.move(to: CGPoint(x: x, y: 0))
            context.addLine(to: CGPoint(x: x, y: height))
        }
        for y in stride(from: 0, to: height, by: 32) {
            context.move(to: CGPoint(x: 0, y: y))
            context.addLine(to: CGPoint(x: width, y: y))
        }
        context.strokePath()
        
        // Target rendering
        if !occluded {
            let cx = normX * Double(width)
            let cy = (1.0 - normY) * Double(height) // CoreGraphics y-inversion
            
            context.saveGState()
            context.translateBy(x: cx, y: cy)
            context.rotate(by: rot)
            context.scaleBy(x: scale, y: scale)
            
            // Outer marker ring
            context.setFillColor(CGColor(red: 0.95, green: 0.75, blue: 0.1, alpha: 1.0))
            context.fillEllipse(in: CGRect(x: -24, y: -24, width: 48, height: 48))
            
            // Inner dark ring
            context.setFillColor(CGColor(red: 0.1, green: 0.1, blue: 0.1, alpha: 1.0))
            context.fillEllipse(in: CGRect(x: -16, y: -16, width: 32, height: 32))
            
            // High contrast center dot
            context.setFillColor(CGColor(red: 1.0, green: 1.0, blue: 1.0, alpha: 1.0))
            context.fillEllipse(in: CGRect(x: -6, y: -6, width: 12, height: 12))
            
            context.restoreGState()
        } else {
            // Draw gray occluder bar over target area
            let cx = normX * Double(width)
            let cy = (1.0 - normY) * Double(height)
            context.setFillColor(CGColor(red: 0.2, green: 0.2, blue: 0.2, alpha: 1.0))
            context.fill(CGRect(x: cx - 40, y: cy - 40, width: 80, height: 80))
        }
        
        CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
        
        let frameTime = CMTime(value: Int64(f), timescale: fps)
        while !input.isReadyForMoreMediaData {
            Thread.sleep(forTimeInterval: 0.005)
        }
        adaptor.append(pixelBuffer, withPresentationTime: frameTime)
    }
    
    input.markAsFinished()
    let sema = DispatchSemaphore(value: 0)
    writer.finishWriting {
        sema.signal()
    }
    sema.wait()
    
    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted
    let data = try encoder.encode(groundTruths)
    try data.write(to: jsonUrl)
    print("Generated track-target.mp4 (\(totalFrames) frames, \(url.path)) and JSON")
}

func createShakyVideo(url: URL, jsonUrl: URL) throws {
    let width = 640
    let height = 360
    let fps: Int32 = 30
    let totalFrames = 90
    
    var groundTruths: [ShakeGroundTruth] = []
    
    let writer = try AVAssetWriter(outputURL: url, fileType: .mp4)
    let settings: [String: Any] = [
        AVVideoCodecKey: AVVideoCodecType.h264,
        AVVideoWidthKey: width,
        AVVideoHeightKey: height,
        AVVideoCompressionPropertiesKey: [
            AVVideoAverageBitRateKey: 1_200_000
        ]
    ]
    let input = AVAssetWriterInput(mediaType: .video, outputSettings: settings)
    input.expectsMediaDataInRealTime = false
    
    let attributes: [String: Any] = [
        kCVPixelBufferPixelFormatTypeKey as String: kCVPixelFormatType_32ARGB,
        kCVPixelBufferWidthKey as String: width,
        kCVPixelBufferHeightKey as String: height,
        kCVPixelBufferCGImageCompatibilityKey as String: true,
        kCVPixelBufferCGBitmapContextCompatibilityKey as String: true
    ]
    let adaptor = AVAssetWriterInputPixelBufferAdaptor(assetWriterInput: input, sourcePixelBufferAttributes: attributes)
    
    writer.add(input)
    writer.startWriting()
    writer.startSession(atSourceTime: .zero)
    
    let colorSpace = CGColorSpaceCreateDeviceRGB()
    
    for f in 0..<totalFrames {
        let timeUs = Int64(Double(f) / Double(fps) * 1_000_000)
        
        // Deterministic high-frequency pseudo-random camera jitter
        let jx = 6.0 * sin(Double(f) * 1.7) + 3.0 * cos(Double(f) * 3.1)
        let jy = 5.0 * cos(Double(f) * 1.9) - 2.5 * sin(Double(f) * 2.7)
        let jrot = 0.02 * sin(Double(f) * 2.3)
        
        groundTruths.append(ShakeGroundTruth(
            frame: f,
            timeUs: timeUs,
            dx: jx,
            dy: jy,
            rotation: jrot
        ))
        
        var maybeBuffer: CVPixelBuffer?
        CVPixelBufferPoolCreatePixelBuffer(kCFAllocatorDefault, adaptor.pixelBufferPool!, &maybeBuffer)
        guard let pixelBuffer = maybeBuffer else { break }
        
        CVPixelBufferLockBaseAddress(pixelBuffer, [])
        let context = CGContext(
            data: CVPixelBufferGetBaseAddress(pixelBuffer),
            width: width,
            height: height,
            bitsPerComponent: 8,
            bytesPerRow: CVPixelBufferGetBytesPerRow(pixelBuffer),
            space: colorSpace,
            bitmapInfo: CGImageAlphaInfo.noneSkipFirst.rawValue
        )!
        
        // Apply camera shake transform
        context.saveGState()
        context.translateBy(x: CGFloat(width) / 2.0 + CGFloat(jx), y: CGFloat(height) / 2.0 + CGFloat(jy))
        context.rotate(by: CGFloat(jrot))
        context.translateBy(x: -CGFloat(width) / 2.0, y: -CGFloat(height) / 2.0)
        
        // Static background scene with textured geometric elements
        context.setFillColor(CGColor(red: 0.18, green: 0.22, blue: 0.28, alpha: 1.0))
        context.fill(CGRect(x: -50, y: -50, width: width + 100, height: height + 100))
        
        context.setFillColor(CGColor(red: 0.8, green: 0.3, blue: 0.2, alpha: 1.0))
        context.fill(CGRect(x: 100, y: 80, width: 140, height: 100))
        
        context.setFillColor(CGColor(red: 0.2, green: 0.6, blue: 0.8, alpha: 1.0))
        context.fillEllipse(in: CGRect(x: 340, y: 120, width: 160, height: 140))
        
        context.setStrokeColor(CGColor(red: 0.9, green: 0.9, blue: 0.9, alpha: 1.0))
        context.setLineWidth(4.0)
        context.stroke(CGRect(x: 200, y: 180, width: 220, height: 120))
        
        context.restoreGState()
        
        CVPixelBufferUnlockBaseAddress(pixelBuffer, [])
        
        let frameTime = CMTime(value: Int64(f), timescale: fps)
        while !input.isReadyForMoreMediaData {
            Thread.sleep(forTimeInterval: 0.005)
        }
        adaptor.append(pixelBuffer, withPresentationTime: frameTime)
    }
    
    input.markAsFinished()
    let sema = DispatchSemaphore(value: 0)
    writer.finishWriting {
        sema.signal()
    }
    sema.wait()
    
    let encoder = JSONEncoder()
    encoder.outputFormatting = .prettyPrinted
    let data = try encoder.encode(groundTruths)
    try data.write(to: jsonUrl)
    print("Generated shaky.mp4 (\(totalFrames) frames, \(url.path)) and JSON")
}

let root = URL(fileURLWithPath: FileManager.default.currentDirectoryPath)
let targetVideo = root.appendingPathComponent("tests/fixtures/track-target.mp4")
let targetJson = root.appendingPathComponent("tests/fixtures/track-target.json")
let shakyVideo = root.appendingPathComponent("tests/fixtures/shaky.mp4")
let shakyJson = root.appendingPathComponent("tests/fixtures/shaky.json")

try createTrackTargetVideo(url: targetVideo, jsonUrl: targetJson)
try createShakyVideo(url: shakyVideo, jsonUrl: shakyJson)

