export declare class DeferredPromise<T> {
    private deferResolve;
    private deferReject;
    private promise;
    constructor();
    asPromise(): Promise<T>;
    resolve(result: T): void;
    reject(error: T): void;
}
