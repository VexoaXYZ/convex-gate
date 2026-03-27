import { defineApp } from "convex/server";
import betterAuth from "convex-gate/convex.config";

const app = defineApp();
app.use(betterAuth);

export default app;
