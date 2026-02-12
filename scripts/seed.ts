import { execSync } from "node:child_process";

function runSeed(): void {
  if (!process.env.CONVEX_DEPLOYMENT) {
    throw new Error(
      "CONVEX_DEPLOYMENT is not set. Run `npx convex dev` once to configure the project, then run `npm run seed`."
    );
  }

  execSync("npx convex run functions/seed:seedAll", {
    stdio: "inherit",
  });
}

runSeed();
