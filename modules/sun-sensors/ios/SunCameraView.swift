import AVFoundation
import ExpoModulesCore
import UIKit

/// Back-camera preview with aspect fill, reporting buffer size and focal length in buffer pixels.
/// Wide (0.5×) switches to the ultra-wide camera when the device has one.
final class SunCameraView: ExpoView {
  let onGeometry = EventDispatcher()
  private let session = AVCaptureSession()
  private let previewLayer: AVCaptureVideoPreviewLayer
  private let sessionQueue = DispatchQueue(label: "sunspotter.camera")
  private var active = false
  private var wide = false
  private var input: AVCaptureDeviceInput?

  required init(appContext: AppContext? = nil) {
    previewLayer = AVCaptureVideoPreviewLayer(session: session)
    super.init(appContext: appContext)
    previewLayer.videoGravity = .resizeAspectFill
    layer.addSublayer(previewLayer)
    backgroundColor = .black
  }

  override func layoutSubviews() {
    super.layoutSubviews()
    previewLayer.frame = bounds
    if let conn = previewLayer.connection, let scene = window?.windowScene {
      let angle: CGFloat
      switch scene.interfaceOrientation {
      case .landscapeLeft: angle = 180
      case .landscapeRight: angle = 0
      case .portraitUpsideDown: angle = 270
      default: angle = 90
      }
      if conn.isVideoRotationAngleSupported(angle) { conn.videoRotationAngle = angle }
    }
  }

  func setActive(_ value: Bool) {
    guard value != active else { return }
    active = value
    sessionQueue.async { value ? self.start() : self.session.stopRunning() }
  }

  func setWide(_ value: Bool) {
    guard value != wide else { return }
    wide = value
    sessionQueue.async { if self.active { self.configure() } }
  }

  private func device() -> AVCaptureDevice? {
    if wide, let uw = AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back) { return uw }
    return AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back)
  }

  private func configure() {
    session.beginConfiguration()
    if let input { session.removeInput(input) }
    session.sessionPreset = .high
    if let d = device(), let i = try? AVCaptureDeviceInput(device: d), session.canAddInput(i) {
      session.addInput(i)
      input = i
    }
    session.commitConfiguration()
    emitGeometry()
  }

  private func start() {
    if input == nil { configure() }
    if !session.isRunning { session.startRunning() }
    emitGeometry()
  }

  private func emitGeometry() {
    guard let d = input?.device else { return }
    let dims = CMVideoFormatDescriptionGetDimensions(d.activeFormat.formatDescription)
    let w = Double(max(dims.width, dims.height))
    let h = Double(min(dims.width, dims.height))
    // videoFieldOfView is the horizontal FOV across the format's long side, in degrees.
    let fov = Double(d.activeFormat.videoFieldOfView) * .pi / 180
    let focalPx = (w / 2) / tan(fov / 2) * Double(d.videoZoomFactor)
    let hasUltraWide = AVCaptureDevice.default(.builtInUltraWideCamera, for: .video, position: .back) != nil
    let isUltraWide = d.deviceType == .builtInUltraWideCamera
    DispatchQueue.main.async {
      self.onGeometry([
        "bufferWidth": w, "bufferHeight": h, "focalPx": focalPx,
        "zoom": isUltraWide ? 0.5 : 1.0, "hasUltraWide": hasUltraWide, "source": "fov",
      ])
    }
  }
}
