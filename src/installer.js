// Keep the previously validated macOS installer independent of Windows policy.
const implementation = await import(process.platform==='win32' ? './installers/windows.js' : './installers/macos.js');
export const { defaultApp, stateDir, inspect, install, restore, status, recipeHash } = implementation;
