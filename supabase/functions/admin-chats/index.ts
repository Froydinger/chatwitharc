Deno.serve(() => Response.json({ error: "This audit endpoint has been retired." }, { status: 410 }));
