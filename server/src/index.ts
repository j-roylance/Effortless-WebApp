import { app } from "./app.js";
import { env } from "./lib/env.js";

app.listen(env.port, () => {
  console.log(`Effortless API listening on http://localhost:${env.port}`);
});
