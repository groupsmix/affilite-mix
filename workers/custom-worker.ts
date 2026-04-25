import { cronJobs } from '../config/cron-registry';

export default {
  async scheduled(controller: any, env: any) {
    // Generate routing map from the registry
    const CRON_ROUTES: Record<string, { path: string, secretEnv: string }> = {};
    cronJobs.forEach(job => {
      CRON_ROUTES[job.schedule] = { path: job.path, secretEnv: job.secretEnv };
    });

    const route = CRON_ROUTES[controller.cron];

    if (!route) {
      console.error("Unknown cron schedule", controller.cron);
      return;
    }

    const secret = env[route.secretEnv];

    const response = await fetch(`${env.CRON_HOST}${route.path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${secret}`,
      },
    });

    if (!response.ok) {
      console.error("Cron failed", {
        cron: controller.cron,
        path: route.path,
        status: response.status,
      });
    }
  }
};
