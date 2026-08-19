const http = require("node:http");
const next = require("next");

const port = Number.parseInt(process.env.PORT || "3000", 10);
const hostname = process.env.HOSTNAME || "0.0.0.0";

const app = next({
  dev: false,
  hostname,
  port,
});
const handle = app.getRequestHandler();

app
  .prepare()
  .then(() => {
    const server = http.createServer((req, res) => handle(req, res));
    server.listen(port, hostname, () => {
      console.log(`Spady production server listening on ${hostname}:${port}`);
    });
  })
  .catch((error) => {
    console.error("Failed to start Spady production server", error);
    process.exit(1);
  });

process.on("SIGTERM", () => process.exit(0));
process.on("SIGINT", () => process.exit(0));
