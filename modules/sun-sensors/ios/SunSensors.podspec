Pod::Spec.new do |s|
  s.name           = 'SunSensors'
  s.version        = '1.0.0'
  s.summary        = 'Attitude, camera geometry, location, haptics and OS time zones for SunSpotter'
  s.description    = s.summary
  s.license        = 'UNLICENSED'
  s.author         = 'SunSpotter'
  s.homepage       = 'https://example.invalid'
  s.platforms      = { :ios => '16.4' }
  s.swift_version  = '5.9'
  s.source         = { git: '' }
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'CoreMotion', 'CoreLocation', 'AVFoundation', 'UIKit'
  s.source_files = "**/*.{h,m,swift}"
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES', 'SWIFT_COMPILATION_MODE' => 'wholemodule' }
end
