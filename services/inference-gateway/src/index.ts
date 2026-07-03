import express from "express";
import { createProvider, type ChatMessage } from "./providers/index.js";

const app = express();
app.use(express.json());

const provider = createProvider(process.env);
const port = Number(process.env.PORT ?? 4000);

app.get("/health", (_req, res) => {
  res.json({ ok: true, provider: provider.name });
});

app.post("/v1/chat", async (req, res) => {
  const messages = req.body?.messages as ChatMessage[] | undefined;
  if (!Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({ error: "body.messages must be a non-empty array" });
    return;
  }

  try {
    const reply = await provider.chat(messages);
    res.json({ provider: provider.name, reply });
  } catch (err) {
    res.status(502).json({ error: (err as Error).message });
  }
});

app.listen(port, () => {
  console.log(`inference-gateway listening on :${port} (provider=${provider.name})`);
});
