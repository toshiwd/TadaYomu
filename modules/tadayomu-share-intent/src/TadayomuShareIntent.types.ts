export type TadayomuShareIntentModuleEvents = {
  onShareReceived: (params: ShareReceivedEventPayload) => void;
};

export type ShareReceivedEventPayload = {
  text: string;
};
