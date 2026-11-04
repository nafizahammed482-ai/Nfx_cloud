import { t as BiometricAuthBase } from "./base-C9hazAh4.js";
import { a as BiometryType, i as BiometryErrorType, n as getBiometryName, r as BiometryError } from "./index-BmNi_-e0.js";
// node_modules/@aparajita/capacitor-biometric-auth/dist/esm/web.js
var BiometricAuthWeb = class extends BiometricAuthBase {
	constructor() {
		super(...arguments);
		this.biometryType = BiometryType.none;
		this.biometryTypes = [];
		this.biometryIsEnrolled = false;
		this.deviceIsSecure = false;
	}
	async checkBiometry() {
		const hasBiometry = this.biometryType !== BiometryType.none;
		const available = hasBiometry && this.biometryIsEnrolled;
		let reason = "";
		let code = BiometryErrorType.none;
		if (!hasBiometry) {
			reason = "No biometry is available";
			code = BiometryErrorType.biometryNotAvailable;
		} else if (!this.biometryIsEnrolled) {
			reason = "Biometry is not enrolled";
			code = BiometryErrorType.biometryNotEnrolled;
		}
		return {
			isAvailable: available,
			strongBiometryIsAvailable: this.biometryIsEnrolled && this.hasStrongBiometry(),
			biometryType: this.biometryType,
			biometryTypes: this.biometryTypes,
			deviceIsSecure: this.deviceIsSecure,
			reason,
			code
		};
	}
	hasStrongBiometry() {
		return this.biometryTypes.some((type) => type === BiometryType.faceId || type === BiometryType.touchId || type === BiometryType.fingerprintAuthentication);
	}
	async internalAuthenticate(options) {
		const result = await this.checkBiometry();
		if (result.isAvailable && confirm((options === null || options === void 0 ? void 0 : options.reason) || `Authenticate with ${result.biometryTypes.map((type) => getBiometryName(type)).join(" or ")}?`)) return;
		if (options === null || options === void 0 ? void 0 : options.allowDeviceCredential) {
			if (result.deviceIsSecure) {
				if (confirm("Authenticate with device security?")) return;
				throw new BiometryError("User cancelled", BiometryErrorType.userCancel);
			} else if (result.isAvailable) throw new BiometryError("Device is not secure", BiometryErrorType.noDeviceCredential);
		} else if (!result.isAvailable) throw result.biometryType === BiometryType.none ? new BiometryError("Biometry is not available", BiometryErrorType.biometryNotAvailable) : new BiometryError("Biometry is not enrolled", BiometryErrorType.biometryNotEnrolled);
		throw new BiometryError("User cancelled", BiometryErrorType.userCancel);
	}
	async setBiometryType(type) {
		if (type === void 0) return;
		const types = Array.isArray(type) ? type : [type];
		this.biometryTypes = [];
		this.biometryType = BiometryType.none;
		if (types.length === 0) return;
		if (isBiometryTypes(types)) {
			this.biometryType = types[0];
			if (this.biometryType !== BiometryType.none) this.biometryTypes = types;
		} else for (const [i, theType] of types.entries()) if (isBiometryType(theType)) {
			if (this.biometryType === BiometryType.none) this.biometryTypes = [];
			else this.biometryTypes.push(theType);
			if (i === 0) this.biometryType = theType;
		}
	}
	async setBiometryIsEnrolled(enrolled) {
		this.biometryIsEnrolled = enrolled;
	}
	async setDeviceIsSecure(isSecure) {
		this.deviceIsSecure = isSecure;
	}
};
function isBiometryType(value) {
	return Object.values(BiometryType).includes(value);
}
function isBiometryTypes(value) {
	return value.every((type) => isBiometryType(type));
}
export { BiometricAuthWeb };
