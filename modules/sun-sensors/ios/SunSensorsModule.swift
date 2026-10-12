import AVFoundation
import CoreLocation
import CoreMotion
import ExpoModulesCore
import UIKit

/// Attitude (CoreMotion, x-true-north z-vertical), heading accuracy, location, haptics, OS time
/// zone offsets and a small key-value store. The OS fuses the sensors; this module only converts
/// frames and low-pass filters (80 ms time constant).
public class SunSensorsModule: Module {
  private let motion = CMMotionManager()
  private let queue = OperationQueue()
  private lazy var locationDelegate = LocationDelegate(module: self)
  private var filtered: simd_quatd?
  private var lastTimestamp: TimeInterval = 0
  private var headingAccuracy: Double = -1

  public func definition() -> ModuleDefinition {
    Name("SunSensors")
    Events("onAttitude", "onLocation")

    Function("startSensors") { self.startSensors() }
    Function("stopSensors") { self.motion.stopDeviceMotionUpdates() }
    Function("startLocation") { DispatchQueue.main.async { self.locationDelegate.start() } }
    Function("stopLocation") { DispatchQueue.main.async { self.locationDelegate.stop() } }
    Function("lastKnownLocation") { () -> [String: Double]? in
      guard let l = self.locationDelegate.manager.location else { return nil }
      return LocationDelegate.map(l)
    }
    Function("displayRotation") { () -> Int in
      var orientation: UIInterfaceOrientation = .portrait
      let read = {
        let scene = UIApplication.shared.connectedScenes.first { $0 is UIWindowScene } as? UIWindowScene
        orientation = scene?.interfaceOrientation ?? .portrait
      }
      if Thread.isMainThread { read() } else { DispatchQueue.main.sync(execute: read) }
      switch orientation {
      case .landscapeRight: return 90 // home side right: device turned counter-clockwise
      case .landscapeLeft: return 270
      case .portraitUpsideDown: return 180
      default: return 0
      }
    }
    Function("tzOffsetMinutes") { (zone: String, ms: Double) -> Int in
      let date = Date(timeIntervalSince1970: ms / 1000)
      return (TimeZone(identifier: zone)?.secondsFromGMT(for: date) ?? 0) / 60
    }
    Function("getItem") { (key: String) -> String? in UserDefaults.standard.string(forKey: "sunspotter." + key) }
    Function("setItem") { (key: String, value: String?) in
      if let value { UserDefaults.standard.set(value, forKey: "sunspotter." + key) }
      else { UserDefaults.standard.removeObject(forKey: "sunspotter." + key) }
    }
    Function("haptic") { (kind: String) in
      DispatchQueue.main.async {
        switch kind {
        case "light": UISelectionFeedbackGenerator().selectionChanged()
        case "medium": UIImpactFeedbackGenerator(style: .medium).impactOccurred()
        case "success": UINotificationFeedbackGenerator().notificationOccurred(.success)
        case "warning": UINotificationFeedbackGenerator().notificationOccurred(.warning)
        default: break
        }
      }
    }
    Function("openSettings") {
      DispatchQueue.main.async {
        if let url = URL(string: UIApplication.openSettingsURLString) { UIApplication.shared.open(url) }
      }
    }
    AsyncFunction("cameraPermission") { (ask: Bool, promise: Promise) in
      let status = AVCaptureDevice.authorizationStatus(for: .video)
      if status == .notDetermined && ask {
        AVCaptureDevice.requestAccess(for: .video) { granted in
          promise.resolve(["status": granted ? "granted" : "denied", "granted": granted, "canAskAgain": false])
        }
        return
      }
      promise.resolve(Self.permissionMap(status == .authorized, undetermined: status == .notDetermined))
    }
    AsyncFunction("locationPermission") { (ask: Bool, promise: Promise) in
      DispatchQueue.main.async {
        let status = self.locationDelegate.manager.authorizationStatus
        if status == .notDetermined && ask {
          self.locationDelegate.onAuthorization = { s in
            promise.resolve(Self.permissionMap(s == .authorizedWhenInUse || s == .authorizedAlways, undetermined: false))
          }
          self.locationDelegate.manager.requestWhenInUseAuthorization()
          return
        }
        promise.resolve(Self.permissionMap(
          status == .authorizedWhenInUse || status == .authorizedAlways, undetermined: status == .notDetermined))
      }
    }

    View(SunCameraView.self) {
      Events("onGeometry")
      Prop("active") { (view: SunCameraView, active: Bool) in view.setActive(active) }
      Prop("wide") { (view: SunCameraView, wide: Bool) in view.setWide(wide) }
    }

    OnAppEntersBackground {
      self.motion.stopDeviceMotionUpdates()
      DispatchQueue.main.async { self.locationDelegate.stop() }
    }
  }

  static func permissionMap(_ granted: Bool, undetermined: Bool) -> [String: Any] {
    ["status": granted ? "granted" : (undetermined ? "undetermined" : "denied"),
     "granted": granted, "canAskAgain": undetermined]
  }

  func setHeadingAccuracy(_ a: Double) { headingAccuracy = a }

  private func startSensors() {
    guard motion.isDeviceMotionAvailable, !motion.isDeviceMotionActive else { return }
    guard CMMotionManager.availableAttitudeReferenceFrames().contains(.xTrueNorthZVertical) else { return }
    DispatchQueue.main.async { self.locationDelegate.startHeading() }
    motion.deviceMotionUpdateInterval = 1.0 / 100.0
    motion.startDeviceMotionUpdates(using: .xTrueNorthZVertical, to: queue) { [weak self] dm, _ in
      guard let self, let dm else { return }
      self.handle(dm)
    }
  }

  private func handle(_ dm: CMDeviceMotion) {
    // CMAttitude.rotationMatrix maps reference-frame vectors to device vectors: v_d = M v_ref.
    // Reference: x = true north, y = west, z = up. ENU: east = −y_ref, north = x_ref, up = z_ref.
    let m = dm.attitude.rotationMatrix
    // Device → reference is Mᵀ; then reference → ENU.
    // Column j of Mᵀ = row j of M = device axis j in reference coords.
    func enu(_ rx: Double, _ ry: Double, _ rz: Double) -> SIMD3<Double> { SIMD3(-ry, rx, rz) }
    let dx = enu(m.m11, m.m12, m.m13)
    let dy = enu(m.m21, m.m22, m.m23)
    let dz = enu(m.m31, m.m32, m.m33)
    let r = simd_double3x3(columns: (dx, dy, dz)) // device → ENU
    var q = simd_quatd(r)
    if let prev = filtered, lastTimestamp > 0 {
      let dt = dm.timestamp - lastTimestamp
      if simd_dot(prev.vector, q.vector) < 0 { q = simd_quatd(vector: -q.vector) }
      q = simd_slerp(prev, q, 1 - exp(-dt / 0.08))
    }
    filtered = q
    lastTimestamp = dm.timestamp
    let reliable = headingAccuracy >= 0 && headingAccuracy <= 15
    sendEvent("onAttitude", [
      "q": [q.imag.x, q.imag.y, q.imag.z, q.real],
      "headingAccuracy": headingAccuracy,
      "headingReliable": reliable,
      "t": Date().timeIntervalSince1970 * 1000,
    ])
  }

  fileprivate func emitLocation(_ l: CLLocation) {
    sendEvent("onLocation", LocationDelegate.map(l))
  }
}

final class LocationDelegate: NSObject, CLLocationManagerDelegate {
  let manager = CLLocationManager()
  weak var module: SunSensorsModule?
  var onAuthorization: ((CLAuthorizationStatus) -> Void)?

  init(module: SunSensorsModule) {
    self.module = module
    super.init()
    manager.delegate = self
    manager.desiredAccuracy = kCLLocationAccuracyBest
    manager.distanceFilter = 10
    manager.headingFilter = 1
  }

  static func map(_ l: CLLocation) -> [String: Double] {
    ["latitude": l.coordinate.latitude, "longitude": l.coordinate.longitude,
     "accuracy": l.horizontalAccuracy, "time": l.timestamp.timeIntervalSince1970 * 1000]
  }

  func start() { manager.startUpdatingLocation() }
  func stop() { manager.stopUpdatingLocation(); manager.stopUpdatingHeading() }
  func startHeading() { if CLLocationManager.headingAvailable() { manager.startUpdatingHeading() } }

  func locationManager(_ m: CLLocationManager, didUpdateLocations locations: [CLLocation]) {
    if let l = locations.last { module?.emitLocation(l) }
  }
  func locationManager(_ m: CLLocationManager, didUpdateHeading h: CLHeading) {
    module?.setHeadingAccuracy(h.headingAccuracy)
  }
  func locationManagerShouldDisplayHeadingCalibration(_ m: CLLocationManager) -> Bool { false }
  func locationManagerDidChangeAuthorization(_ m: CLLocationManager) {
    if m.authorizationStatus != .notDetermined, let cb = onAuthorization {
      onAuthorization = nil
      cb(m.authorizationStatus)
    }
  }
}
