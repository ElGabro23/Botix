import { contextBridge } from "electron";

contextBridge.exposeInMainWorld("botix", {
  platform: "desktop"
});

