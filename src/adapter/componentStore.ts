import { createConvexGateAdapter } from "./index.js";
import type { ConvexGateAdapterConfig } from "./index.js";
import { createComponentStore } from "../component/store.js";
import type { AuthComponentApi } from "../component/index.js";

export interface CreateComponentBackedAdapterOptions
  extends Omit<ConvexGateAdapterConfig, "store"> {
  component: AuthComponentApi;
}

export function createComponentBackedAdapter({
  component,
  ...config
}: CreateComponentBackedAdapterOptions) {
  return createConvexGateAdapter({
    ...config,
    store: createComponentStore(component),
  });
}
