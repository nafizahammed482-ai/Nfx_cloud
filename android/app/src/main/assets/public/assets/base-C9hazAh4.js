const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/web-B14R1EH3.js","assets/index-BmNi_-e0.js"])))=>i.map(i=>d[i]);
import { c as WebPlugin, l as registerPlugin, o as isBiometryErrorType, r as BiometryError, s as CapacitorException, t as __vitePreload } from "./index-BmNi_-e0.js";
// node_modules/@capacitor/app/dist/esm/index.js
var App = registerPlugin("App", { web: () => __vitePreload(() => import("./web-B14R1EH3.js").then((m) => new m.AppWeb()), __vite__mapDeps([0,1])) });
// node_modules/@aparajita/capacitor-biometric-auth/dist/esm/base.js
var BiometricAuthBase = class extends WebPlugin {
	async authenticate(options) {
		try {
			await this.internalAuthenticate(options);
		} catch (error) {
			throw error instanceof CapacitorException && isBiometryErrorType(error.code) ? new BiometryError(error.message, error.code) : error;
		}
	}
	async addResumeListener(listener) {
		return App.addListener("appStateChange", ({ isActive }) => {
			if (isActive) (async () => {
				try {
					listener(await this.checkBiometry());
				} catch (error) {
					console.error(error);
				}
			})();
		});
	}
};
export { BiometricAuthBase as t };
