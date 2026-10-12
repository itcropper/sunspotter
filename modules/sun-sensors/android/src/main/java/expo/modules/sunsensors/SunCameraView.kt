package expo.modules.sunsensors

import android.annotation.SuppressLint
import android.content.Context
import android.hardware.camera2.CameraCharacteristics
import android.os.Build
import androidx.camera.camera2.interop.Camera2CameraInfo
import androidx.camera.camera2.interop.ExperimentalCamera2Interop
import androidx.camera.core.Camera
import androidx.camera.core.CameraSelector
import androidx.camera.core.Preview
import androidx.camera.lifecycle.ProcessCameraProvider
import androidx.camera.view.PreviewView
import androidx.core.content.ContextCompat
import androidx.lifecycle.LifecycleOwner
import expo.modules.kotlin.AppContext
import expo.modules.kotlin.viewevent.EventDispatcher
import expo.modules.kotlin.views.ExpoView
import kotlin.math.min

/**
 * Back-camera preview (aspect fill, like the overlay assumes) that reports the geometry the
 * overlay needs: preview buffer size and focal length in buffer pixels (Spec-Math "Camera model").
 * Wide (0.5×) uses a zoom ratio below 1, which CameraX maps to the ultra-wide camera on logical
 * multi-camera devices. Without one, JS falls back to scaling the 1× preview.
 */
class SunCameraView(context: Context, appContext: AppContext) : ExpoView(context, appContext) {
  private val onGeometry by EventDispatcher()
  private val previewView = PreviewView(context).apply {
    scaleType = PreviewView.ScaleType.FILL_CENTER
    implementationMode = PreviewView.ImplementationMode.PERFORMANCE
  }
  private var provider: ProcessCameraProvider? = null
  private var camera: Camera? = null
  private var preview: Preview? = null
  private var active = false
  private var wide = false

  init {
    addView(previewView, LayoutParams(LayoutParams.MATCH_PARENT, LayoutParams.MATCH_PARENT))
  }

  fun setActive(value: Boolean) {
    if (value == active) return
    active = value
    if (active) bind() else unbind()
  }

  fun setWide(value: Boolean) {
    if (value == wide) return
    wide = value
    applyZoom()
  }

  private fun bind() {
    val future = ProcessCameraProvider.getInstance(context)
    future.addListener({
      val p = future.get()
      provider = p
      val owner = appContext.currentActivity as? LifecycleOwner ?: return@addListener
      val pv = Preview.Builder().build().also { it.surfaceProvider = previewView.surfaceProvider }
      preview = pv
      try {
        p.unbindAll()
        camera = p.bindToLifecycle(owner, CameraSelector.DEFAULT_BACK_CAMERA, pv)
        applyZoom()
        // Resolution is known once the surface is attached.
        previewView.post { emitGeometry() }
        previewView.postDelayed({ emitGeometry() }, 500)
      } catch (_: Exception) {
      }
    }, ContextCompat.getMainExecutor(context))
  }

  private fun unbind() {
    provider?.unbindAll()
    camera = null
  }

  private fun applyZoom() {
    val cam = camera ?: return
    val min = cam.cameraInfo.zoomState.value?.minZoomRatio ?: 1f
    val ratio = if (wide && min <= 0.5f) 0.5f else 1f
    cam.cameraControl.setZoomRatio(ratio).addListener({ emitGeometry() }, ContextCompat.getMainExecutor(context))
  }

  @SuppressLint("RestrictedApi")
  @androidx.annotation.OptIn(ExperimentalCamera2Interop::class)
  private fun emitGeometry() {
    val cam = camera ?: return
    val res = preview?.resolutionInfo?.resolution ?: return
    val info = Camera2CameraInfo.from(cam.cameraInfo)
    val active = info.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_ACTIVE_ARRAY_SIZE)
    val physical = info.getCameraCharacteristic(CameraCharacteristics.SENSOR_INFO_PHYSICAL_SIZE)
    val focal = info.getCameraCharacteristic(CameraCharacteristics.LENS_INFO_AVAILABLE_FOCAL_LENGTHS)?.firstOrNull()
    val bufW = maxOf(res.width, res.height).toDouble()
    val bufH = minOf(res.width, res.height).toDouble()
    val activeW = active?.width()?.toDouble() ?: bufW
    val activeH = active?.height()?.toDouble() ?: bufH
    // Focal length in active-array pixels: intrinsic calibration when present, else mm / sensor size.
    var source = "fov"
    var fActive: Double? = null
    if (Build.VERSION.SDK_INT >= 28) {
      val calib = info.getCameraCharacteristic(CameraCharacteristics.LENS_INTRINSIC_CALIBRATION)
      if (calib != null && calib.size >= 2 && calib[0] > 0f) {
        fActive = calib[0].toDouble()
        source = "intrinsics"
      }
    }
    if (fActive == null && focal != null && physical != null && physical.width > 0f) {
      fActive = focal / physical.width * activeW
      source = "focal"
    }
    val fA = fActive ?: (activeW / 2 / Math.tan(Math.toRadians(32.5)))
    // The stream is the largest centered crop of the active array with the buffer's aspect, scaled.
    val pxPerBuffer = min(activeW / bufW, activeH / bufH)
    val zoom = cam.cameraInfo.zoomState.value?.zoomRatio ?: 1f
    val minZoom = cam.cameraInfo.zoomState.value?.minZoomRatio ?: 1f
    onGeometry(mapOf(
      "bufferWidth" to bufW,
      "bufferHeight" to bufH,
      "focalPx" to fA / pxPerBuffer * zoom,
      "zoom" to zoom.toDouble(),
      "hasUltraWide" to (minZoom <= 0.5f),
      "source" to source,
    ))
  }

  override fun onDetachedFromWindow() {
    super.onDetachedFromWindow()
    unbind()
  }
}
