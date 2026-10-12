// Bundled Space Grotesk (SIL OFL 1.1). Embedded at build time by the expo-font config plugin for
// RN Text, and loaded from the app bundle (never the network) for Skia paragraphs.
import { type DataModule } from '@shopify/react-native-skia';

import { type } from '../theme/tokens';

export const FONT = type.family;

export const SKIA_FONTS: Record<string, DataModule[]> = {
  SpaceGrotesk: [
    require('../../assets/fonts/SpaceGrotesk-Medium.ttf'),
    require('../../assets/fonts/SpaceGrotesk-SemiBold.ttf'),
    require('../../assets/fonts/SpaceGrotesk-Bold.ttf'),
  ],
};
