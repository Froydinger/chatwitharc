import { assertRejects } from "jsr:@std/assert@1/rejects";
import { fetchPublicMedia } from "./safeRemoteMedia.ts";

Deno.test("fetchPublicMedia rejects non-HTTPS and local destinations before fetching", async () => {
  await assertRejects(
    () => fetchPublicMedia("http://example.com/image.png"),
    Error,
    "HTTPS",
  );
  await assertRejects(
    () => fetchPublicMedia("https://localhost/image.png"),
    Error,
    "not allowed",
  );
  await assertRejects(
    () => fetchPublicMedia("https://127.0.0.1/image.png"),
    Error,
    "not allowed",
  );
  await assertRejects(
    () => fetchPublicMedia("https://169.254.169.254/latest/meta-data"),
    Error,
    "not allowed",
  );
  await assertRejects(
    () => fetchPublicMedia("https://[::1]/image.png"),
    Error,
    "not allowed",
  );
});
