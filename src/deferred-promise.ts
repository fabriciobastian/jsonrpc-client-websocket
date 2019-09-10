export class DeferredPromise<T> {
	private deferResolve: any;
	private deferReject: any;

	private promise: Promise<T>;

	constructor() {
		this.promise = new Promise<T>((resolve, reject) => {
			this.deferResolve = resolve;
			this.deferReject = reject;
		});
	}

	public asPromise(): Promise<T> {
		return this.promise;
	}

	public resolve(result: T): void {
		this.deferResolve(result);
	}

	public reject(error: T): void {
		this.deferReject(error);
	}
}
