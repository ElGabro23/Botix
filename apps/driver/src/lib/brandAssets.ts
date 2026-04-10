import type { BrandAssetKey } from "@botix/shared";

export const driverBrandAssets: Record<BrandAssetKey, unknown> = {
  botix: require("../../assets/botix.jpg"),
  sushix: require("../../assets/sushix.jpg"),
  burgerix: require("../../assets/burgerix.jpg"),
  pizzix: require("../../assets/pizzix.jpg")
};
