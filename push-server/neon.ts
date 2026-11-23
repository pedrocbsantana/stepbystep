// Função de push dos lembretes da agenda. Publicar: neon deploy --env .env
import { defineConfig } from "@neon/config/v1";

export default defineConfig({
  functions: {
    lembretes: {
      name: "stepbystep lembretes",
      source: "src/index.js",
      env: {
        VAPID_PUBLIC_KEY: { value: process.env.VAPID_PUBLIC_KEY, required: true },
        VAPID_PRIVATE_KEY: { value: process.env.VAPID_PRIVATE_KEY, required: true },
        VAPID_SUBJECT: { value: process.env.VAPID_SUBJECT, required: true },
      },
    },
  },
  triggers: {
    "lembretes-5min": {
      type: "schedule",
      function: "lembretes",
      cron: "*/5 * * * *",
      functionPath: "/tick",
    },
  },
});
