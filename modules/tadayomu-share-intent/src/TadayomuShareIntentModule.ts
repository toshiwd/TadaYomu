import { NativeModule, requireOptionalNativeModule } from 'expo';

import { TadayomuShareIntentModuleEvents } from './TadayomuShareIntent.types';

declare class TadayomuShareIntentModule extends NativeModule<TadayomuShareIntentModuleEvents> {
  consumeInitialShareText(): string | null;
}

export default requireOptionalNativeModule<TadayomuShareIntentModule>('TadayomuShareIntent');
