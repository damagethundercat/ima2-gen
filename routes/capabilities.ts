import type { Express, Request, Response } from "express";
import { buildIma2Capabilities } from "../lib/capabilities.js";
import { requireRuntimeContext, type RouteRuntimeContext } from "../lib/runtimeContext.js";

export function registerCapabilitiesRoutes(app: Express, ctxRaw: RouteRuntimeContext) {
  const ctx = requireRuntimeContext(ctxRaw);

  app.get("/api/capabilities", (_req: Request, res: Response) => {
    res.json(
      buildIma2Capabilities({
        appConfig: ctx.config,
        packageVersion: ctx.packageVersion,
        source: "server",
        server: ctx.serverUrl || `http://localhost:${ctx.serverActualPort || ctx.config.server.port}`,
      }),
    );
  });
}
