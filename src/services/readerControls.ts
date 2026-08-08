import { DeviceEventEmitter, NativeModules, Platform } from "react-native";
import {
  getVolumeButtonPageDirection,
  type ReaderPageDirection,
  type ReaderVolumeButton,
} from "./readerInput";

const READER_VOLUME_EVENT = "tadayomuReaderVolumeButton";

interface NativeReaderControls {
  setVolumePagingEnabled(enabled: boolean): void;
}

const nativeReaderControls = NativeModules.TadayomuReaderControls as
  | NativeReaderControls
  | undefined;

export function setVolumePagingEnabled(enabled: boolean): void {
  if (Platform.OS !== "android") return;
  nativeReaderControls?.setVolumePagingEnabled(enabled);
}

export function addVolumePageTurnListener(
  listener: (direction: ReaderPageDirection) => void,
): { remove(): void } {
  if (Platform.OS !== "android" || !nativeReaderControls) {
    return { remove: () => undefined };
  }

  return DeviceEventEmitter.addListener(
    READER_VOLUME_EVENT,
    (button: ReaderVolumeButton) => {
      if (button !== "volumeDown" && button !== "volumeUp") return;
      listener(getVolumeButtonPageDirection(button));
    },
  );
}
