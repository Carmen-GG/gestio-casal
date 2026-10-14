import { crearApp } from "./app";
import type { Env } from "./env";

const app = crearApp();

export default {
  fetch: (request, env, ctx) => app.fetch(request, env, ctx),
} satisfies ExportedHandler<Env>;
