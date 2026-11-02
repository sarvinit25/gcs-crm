import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";

// Local-only: lets the built CRM answer on a temporary public tunnel address.
export default mergeConfig(
  base,
  defineConfig({ server: { allowedHosts: true }, preview: { allowedHosts: true } }),
);
