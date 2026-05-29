/**
 * H-4: Composable middleware modules.
 *
 * Each module handles a single concern and is independently testable.
 * The root middleware.ts composes them into the request pipeline.
 */
export { compose, type MiddlewareContext, type MiddlewareFunction } from "./compose";
export { withMaintenance } from "./maintenance";
export { withCorsPreflight } from "./cors";
export { withCsrf } from "./csrf";
