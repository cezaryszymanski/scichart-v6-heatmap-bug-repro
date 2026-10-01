import { readFileSync } from "node:fs";
import { defineConfig } from "vite";

// GET /shmem returns system Shmem in MB (Linux only). On Linux with integrated GPUs,
// GPU buffers are shmem-backed, so this tracks GPU memory that per-process tools miss.
export default defineConfig({
    plugins: [
        {
            name: "shmem",
            configureServer(server) {
                server.middlewares.use("/shmem", (_req, res) => {
                    try {
                        const kb = Number(/^Shmem:\s+(\d+)/m.exec(readFileSync("/proc/meminfo", "utf8"))[1]);
                        res.end(String(Math.round(kb / 1024)));
                    } catch {
                        res.statusCode = 404;
                        res.end();
                    }
                });
            },
        },
    ],
});
