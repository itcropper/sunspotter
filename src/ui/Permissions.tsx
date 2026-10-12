// Permission screens P1–P4: camera first (plain dark), then location over the live feed.
// Denied: crossed-out glyph plus an open-settings button. Wordless.
import { Pressable, View } from 'react-native';

import { labels } from '../core/a11y';
import { alpha, color, scrimColor, size, withAlpha } from '../theme/tokens';
import { OpenSettingsGlyph, PermissionGlyph } from './glyphs';

export function PermissionPrompt({ kind, onPress, overFeed }: { kind: 'camera' | 'location'; onPress: () => void; overFeed: boolean }) {
  const P = size.permission;
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: overFeed ? withAlpha(scrimColor, alpha.scrimPermissions) : color.bg, alignItems: 'center', justifyContent: 'center' }}>
      <View
        importantForAccessibility="no"
        accessibilityElementsHidden
        style={{ position: 'absolute', width: P.ring, height: P.ring, borderRadius: P.ring / 2, borderWidth: 2, borderColor: withAlpha(color.ui, overFeed ? 0.22 : alpha.permissionRing) }}
      />
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={kind === 'camera' ? labels.allowCamera : labels.allowLocation}
        accessibilityHint={kind === 'camera' ? labels.allowCameraHint : labels.allowLocationHint}
        onPress={onPress}
        style={{
          width: P.prompt,
          height: P.prompt,
          borderRadius: P.prompt / 2,
          borderWidth: 2,
          borderColor: withAlpha(color.ui, overFeed ? 0.6 : alpha.permissionButtonBorder),
          backgroundColor: overFeed ? withAlpha(color.bg, alpha.surfaceChip) : withAlpha(color.ui, alpha.permissionButtonFill),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <PermissionGlyph kind={kind} gapColor={color.bg} />
      </Pressable>
    </View>
  );
}

export function PermissionDenied({ kind, onOpenSettings, overFeed }: { kind: 'camera' | 'location'; onOpenSettings: () => void; overFeed: boolean }) {
  const P = size.permission;
  return (
    <View style={{ position: 'absolute', left: 0, top: 0, right: 0, bottom: 0, backgroundColor: overFeed ? withAlpha(scrimColor, alpha.scrimPermissions) : color.bg, alignItems: 'center', justifyContent: 'center', gap: P.gap }}>
      <View
        accessible
        accessibilityRole="image"
        accessibilityLabel={kind === 'camera' ? labels.cameraOff : labels.locationOff}
        style={{ width: P.prompt, height: P.prompt, alignItems: 'center', justifyContent: 'center', opacity: overFeed ? 0.7 : alpha.deniedGlyph }}
      >
        <PermissionGlyph kind={kind} off gapColor={color.bg} />
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={kind === 'camera' ? labels.cameraOpenSettings : labels.locationOpenSettings}
        onPress={onOpenSettings}
        style={{
          width: P.openSettings,
          height: P.openSettings,
          borderRadius: P.openSettings / 2,
          borderWidth: 2,
          borderColor: withAlpha(color.ui, overFeed ? 0.6 : alpha.permissionButtonBorder),
          backgroundColor: overFeed ? withAlpha(color.bg, alpha.surfaceChip) : withAlpha(color.ui, alpha.permissionButtonFill),
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <OpenSettingsGlyph />
      </Pressable>
    </View>
  );
}
