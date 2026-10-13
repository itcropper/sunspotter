package expo.modules.sunsensors

import android.Manifest
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.hardware.GeomagneticField
import android.hardware.Sensor
import android.hardware.SensorEvent
import android.hardware.SensorEventListener
import android.hardware.SensorManager
import android.location.Location
import android.location.LocationListener
import android.location.LocationManager
import android.net.Uri
import android.os.Build
import android.os.Bundle
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.provider.Settings
import android.view.HapticFeedbackConstants
import android.view.Surface
import android.view.WindowManager
import androidx.core.content.ContextCompat
import expo.modules.interfaces.permissions.Permissions
import expo.modules.kotlin.Promise
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.util.TimeZone
import kotlin.math.acos
import kotlin.math.exp
import kotlin.math.sin
import kotlin.math.sqrt

/**
 * Attitude (rotation vector, true north), location, haptics, OS time zone offsets and a small
 * key-value store. No sensor fusion happens in JavaScript: the OS fuses the rotation vector and
 * this module only corrects it to true north and low-pass filters it (80 ms time constant).
 */
class SunSensorsModule : Module(), SensorEventListener, LocationListener {
  private val context: Context
    get() = appContext.reactContext ?: throw IllegalStateException("No React context")

  private var sensorManager: SensorManager? = null
  private var running = false
  private var declinationDeg = 0f
  private var lastMagAccuracy = SensorManager.SENSOR_STATUS_ACCURACY_HIGH
  private var filtered: FloatArray? = null
  private var lastTimestampNs = 0L
  private var lastEmitNs = 0L

  private val prefs by lazy { context.getSharedPreferences("sunspotter", Context.MODE_PRIVATE) }

  override fun definition() = ModuleDefinition {
    Name("SunSensors")
    Events("onAttitude", "onLocation")

    Function("startSensors") { startSensors() }
    Function("stopSensors") { stopSensors() }
    Function("startLocation") { startLocation() }
    Function("stopLocation") { stopLocation() }
    Function("lastKnownLocation") { lastKnownLocation()?.let { locationMap(it) } }
    Function("displayRotation") { displayRotation() }

    Function("tzOffsetMinutes") { zone: String, ms: Double ->
      TimeZone.getTimeZone(zone).getOffset(ms.toLong()) / 60000
    }

    Function("getItem") { key: String -> prefs.getString(key, null) }
    Function("setItem") { key: String, value: String? ->
      prefs.edit().apply { if (value == null) remove(key) else putString(key, value) }.apply()
    }

    Function("haptic") { kind: String -> haptic(kind) }

    Function("openSettings") {
      val intent = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS)
        .setData(Uri.fromParts("package", context.packageName, null))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      context.startActivity(intent)
    }

    AsyncFunction("cameraPermission") { ask: Boolean, promise: Promise ->
      if (ask) Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise, Manifest.permission.CAMERA)
      else Permissions.getPermissionsWithPermissionsManager(appContext.permissions, promise, Manifest.permission.CAMERA)
    }
    AsyncFunction("locationPermission") { ask: Boolean, promise: Promise ->
      val perms = arrayOf(Manifest.permission.ACCESS_FINE_LOCATION, Manifest.permission.ACCESS_COARSE_LOCATION)
      // Coarse-only is a valid grant: everything works with approximate location.
      val coarse = ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED
      if (coarse && !ask) {
        promise.resolve(Bundle().apply { putString("status", "granted"); putBoolean("granted", true); putBoolean("canAskAgain", true) })
        return@AsyncFunction
      }
      // JS re-checks with ask=false afterwards, which reports a coarse-only grant as granted.
      if (ask) Permissions.askForPermissionsWithPermissionsManager(appContext.permissions, promise, *perms)
      else Permissions.getPermissionsWithPermissionsManager(appContext.permissions, promise, *perms)
    }

    View(SunCameraView::class) {
      Events("onGeometry")
      Prop("active") { view: SunCameraView, active: Boolean -> view.setActive(active) }
      Prop("wide") { view: SunCameraView, wide: Boolean -> view.setWide(wide) }
    }

    OnActivityEntersBackground { stopSensors(); stopLocation() }
    OnDestroy { stopSensors(); stopLocation() }
  }

  // --- Attitude ---------------------------------------------------------------------------

  private fun startSensors() {
    if (running) return
    val sm = context.getSystemService(Context.SENSOR_SERVICE) as SensorManager
    sensorManager = sm
    val rv = sm.getDefaultSensor(Sensor.TYPE_ROTATION_VECTOR) ?: return
    sm.registerListener(this, rv, SensorManager.SENSOR_DELAY_GAME)
    sm.getDefaultSensor(Sensor.TYPE_MAGNETIC_FIELD)?.let {
      sm.registerListener(this, it, SensorManager.SENSOR_DELAY_NORMAL)
    }
    lastKnownLocation()?.let { updateDeclination(it) }
    running = true
  }

  private fun stopSensors() {
    sensorManager?.unregisterListener(this)
    running = false
    filtered = null
  }

  override fun onAccuracyChanged(sensor: Sensor, accuracy: Int) {
    if (sensor.type == Sensor.TYPE_MAGNETIC_FIELD) lastMagAccuracy = accuracy
  }

  override fun onSensorChanged(event: SensorEvent) {
    if (event.sensor.type == Sensor.TYPE_MAGNETIC_FIELD) {
      lastMagAccuracy = event.accuracy
      return
    }
    if (event.sensor.type != Sensor.TYPE_ROTATION_VECTOR) return
    // Rotation vector → quaternion [x, y, z, w], device → magnetic-north ENU.
    val q = FloatArray(4)
    SensorManager.getQuaternionFromVector(q, event.values) // returns [w, x, y, z]
    var x = q[1]; var y = q[2]; var z = q[3]; var w = q[0]
    // Correct to true north: rotate the world by −declination about up (east declination
    // means magnetic north is clockwise of true north).
    val half = Math.toRadians(-declinationDeg.toDouble()) / 2
    val cz = kotlin.math.cos(half).toFloat()
    val sz = sin(half).toFloat()
    // r = [0,0,sz,cz] ⊗ q
    val nx = cz * x - sz * y
    val ny = cz * y + sz * x
    val nz = cz * z + sz * w
    val nw = cz * w - sz * z
    x = nx; y = ny; z = nz; w = nw

    // Low-pass (slerp toward the new sample), time constant 80 ms.
    val dt = if (lastTimestampNs == 0L) 0.0 else (event.timestamp - lastTimestampNs) / 1e9
    lastTimestampNs = event.timestamp
    val prev = filtered
    val out = if (prev == null || dt <= 0) floatArrayOf(x, y, z, w)
    else slerp(prev, floatArrayOf(x, y, z, w), (1 - exp(-dt / 0.08)).toFloat())
    filtered = out

    // Deliver at most ~120 Hz.
    if (event.timestamp - lastEmitNs < 8_000_000L) return
    lastEmitNs = event.timestamp
    val reliable = lastMagAccuracy >= SensorManager.SENSOR_STATUS_ACCURACY_MEDIUM
    sendEvent("onAttitude", Bundle().apply {
      putDoubleArray("q", doubleArrayOf(out[0].toDouble(), out[1].toDouble(), out[2].toDouble(), out[3].toDouble()))
      putInt("magAccuracy", lastMagAccuracy)
      putBoolean("headingReliable", reliable)
      putDouble("t", System.currentTimeMillis().toDouble())
    })
  }

  private fun slerp(a: FloatArray, bIn: FloatArray, t: Float): FloatArray {
    var b = bIn
    var dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3]
    if (dot < 0) { b = floatArrayOf(-b[0], -b[1], -b[2], -b[3]); dot = -dot }
    if (dot > 0.9995f) {
      val r = FloatArray(4) { a[it] + t * (b[it] - a[it]) }
      val n = sqrt(r.fold(0f) { s, v -> s + v * v })
      return FloatArray(4) { r[it] / n }
    }
    val theta = acos(dot.toDouble())
    val s = sin(theta)
    val wa = (sin((1 - t) * theta) / s).toFloat()
    val wb = (sin(t * theta) / s).toFloat()
    return FloatArray(4) { wa * a[it] + wb * b[it] }
  }

  private fun updateDeclination(loc: Location) {
    declinationDeg = GeomagneticField(
      loc.latitude.toFloat(), loc.longitude.toFloat(), loc.altitude.toFloat(), System.currentTimeMillis(),
    ).declination
  }

  // --- Location ---------------------------------------------------------------------------

  private var locationRunning = false

  private fun hasLocationPermission(): Boolean =
    ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_COARSE_LOCATION) == PackageManager.PERMISSION_GRANTED ||
      ContextCompat.checkSelfPermission(context, Manifest.permission.ACCESS_FINE_LOCATION) == PackageManager.PERMISSION_GRANTED

  @Suppress("MissingPermission")
  private fun startLocation() {
    if (locationRunning || !hasLocationPermission()) return
    val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    // Platform providers only (no Play services). GPS needs fine; network/passive work with coarse.
    for (p in listOf(LocationManager.GPS_PROVIDER, LocationManager.NETWORK_PROVIDER, LocationManager.PASSIVE_PROVIDER)) {
      try {
        if (lm.allProviders.contains(p)) lm.requestLocationUpdates(p, 5000L, 10f, this, Looper.getMainLooper())
      } catch (_: SecurityException) {
      } catch (_: IllegalArgumentException) {
      }
    }
    locationRunning = true
  }

  private fun stopLocation() {
    if (!locationRunning) return
    (context.getSystemService(Context.LOCATION_SERVICE) as LocationManager).removeUpdates(this)
    locationRunning = false
  }

  @Suppress("MissingPermission")
  private fun lastKnownLocation(): Location? {
    if (!hasLocationPermission()) return null
    val lm = context.getSystemService(Context.LOCATION_SERVICE) as LocationManager
    return lm.allProviders.mapNotNull {
      try { lm.getLastKnownLocation(it) } catch (_: SecurityException) { null }
    }.maxByOrNull { it.time }
  }

  private fun locationMap(l: Location) = mapOf(
    "latitude" to l.latitude,
    "longitude" to l.longitude,
    "accuracy" to l.accuracy.toDouble(),
    "time" to l.time.toDouble(),
  )

  override fun onLocationChanged(location: Location) {
    updateDeclination(location)
    sendEvent("onLocation", Bundle().apply {
      putDouble("latitude", location.latitude)
      putDouble("longitude", location.longitude)
      putDouble("accuracy", location.accuracy.toDouble())
      putDouble("time", location.time.toDouble())
    })
  }

  @Deprecated("Deprecated in Java")
  override fun onStatusChanged(provider: String?, status: Int, extras: Bundle?) {}
  override fun onProviderEnabled(provider: String) {}
  override fun onProviderDisabled(provider: String) {}

  // --- Display, haptics -------------------------------------------------------------------

  /** Degrees the device is turned counter-clockwise from its natural orientation. */
  private fun displayRotation(): Int {
    val activity = appContext.currentActivity
    @Suppress("DEPRECATION")
    val rotation = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.R) activity?.display?.rotation
    else (context.getSystemService(Context.WINDOW_SERVICE) as WindowManager).defaultDisplay.rotation
    return when (rotation) {
      Surface.ROTATION_90 -> 90
      Surface.ROTATION_180 -> 180
      Surface.ROTATION_270 -> 270
      else -> 0
    }
  }

  /**
   * Spec-Interactions mapping. CONFIRM/REJECT/SEGMENT_FREQUENT_TICK need API 30; below that use
   * VIRTUAL_KEY / LONG_PRESS / KEYBOARD_TAP.
   *
   * Two paths run on every call:
   *   1. `view.performHapticFeedback` — the preferred, context-aware API. Uses `SEGMENT_FREQUENT_TICK`
   *      on API 30+ (designed for dials/sliders). `FLAG_IGNORE_VIEW_SETTING` keeps it firing even
   *      when the host view hasn't opted into haptics.
   *   2. `Vibrator.vibrate(VibrationEffect)` — direct hardware trigger as a backstop for devices
   *      where `performHapticFeedback` is silent (some skins mute it when "Touch feedback" is off
   *      in system settings). Strength/duration are tuned per kind for a subtle but perceptible
   *      tick on the dial and firmer bumps for medium/success/warning.
   *
   * Requires `android.permission.VIBRATE` (already declared in the manifest).
   */
  private fun haptic(kind: String) {
    val view = appContext.currentActivity?.window?.decorView
    val constant = when (kind) {
      "light" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.SEGMENT_FREQUENT_TICK else HapticFeedbackConstants.KEYBOARD_TAP
      "medium" -> HapticFeedbackConstants.CONTEXT_CLICK
      "success" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.CONFIRM else HapticFeedbackConstants.VIRTUAL_KEY
      "warning" -> if (Build.VERSION.SDK_INT >= 30) HapticFeedbackConstants.REJECT else HapticFeedbackConstants.LONG_PRESS
      else -> return
    }
    view?.post {
      view.performHapticFeedback(constant, HapticFeedbackConstants.FLAG_IGNORE_VIEW_SETTING)
    }
    vibrateFallback(kind)
  }

  private fun vibrateFallback(kind: String) {
    try {
      val vibrator: Vibrator? = if (Build.VERSION.SDK_INT >= 31) {
        (context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager)?.defaultVibrator
      } else {
        @Suppress("DEPRECATION")
        context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
      }
      if (vibrator?.hasVibrator() != true) return
      // Prefer the vendor-tuned predefined effects when available (API 29+). They're specifically
      // designed for frequent dial/slider ticks and the system handles rapid-fire gracefully —
      // whereas `createOneShot` with sub-30 ms durations gets clobbered by the next call before
      // the voice coil fully engages, which is why the dial ticks produced *log output* but no
      // perceptible buzz.
      val effect: VibrationEffect = if (Build.VERSION.SDK_INT >= 29) {
        val predefined = when (kind) {
          "light" -> VibrationEffect.EFFECT_TICK
          "medium" -> VibrationEffect.EFFECT_CLICK
          "success" -> VibrationEffect.EFFECT_HEAVY_CLICK
          "warning" -> VibrationEffect.EFFECT_DOUBLE_CLICK
          else -> return
        }
        VibrationEffect.createPredefined(predefined)
      } else {
        val duration: Long
        val strength: Int
        when (kind) {
          "light" -> { duration = 22L; strength = 180 }
          "medium" -> { duration = 35L; strength = 220 }
          "success" -> { duration = 50L; strength = 250 }
          "warning" -> { duration = 70L; strength = 255 }
          else -> return
        }
        VibrationEffect.createOneShot(duration, strength)
      }
      vibrator.vibrate(effect)
    } catch (e: Exception) {
      android.util.Log.w("SunSensors", "haptic failed", e)
    }
  }
}
