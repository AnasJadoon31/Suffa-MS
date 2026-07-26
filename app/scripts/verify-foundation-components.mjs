import { spawn } from "node:child_process";

const checks = [
  ["npm", ["run", "test:action-menu"]],
  ["npm", ["run", "test:dialogs"]],
  ["npm", ["run", "test:snackbar"]],
];

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.on("exit", (code) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
    child.on("error", reject);
  });
}

for (const [command, args] of checks) {
  await run(command, args);
}

console.log("foundation components: action menu, dialog, and snackbar gates passed");
