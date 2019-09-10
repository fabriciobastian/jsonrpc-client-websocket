"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
class DeferredPromise {
    constructor() {
        this.promise = new Promise((resolve, reject) => {
            this.deferResolve = resolve;
            this.deferReject = reject;
        });
    }
    asPromise() {
        return this.promise;
    }
    resolve(result) {
        this.deferResolve(result);
    }
    reject(error) {
        this.deferReject(error);
    }
}
exports.DeferredPromise = DeferredPromise;
