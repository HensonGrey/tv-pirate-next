/** An HTTP status plus a client-safe message. Upstream detail never travels in one. */
export class ApiError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

export function badRequest(message: string): never {
    throw new ApiError(400, message);
}
