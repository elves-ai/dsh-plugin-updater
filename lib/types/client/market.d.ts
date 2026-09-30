/**
 * Client for the plugin market's versioned update API, `dsh-market/update-api/v1`.
 *
 * The market is a separate plugin: it may be absent, may predate this API, or
 * may be replaced by another provider implementing the same paths. Every read
 * therefore narrows only the fields it needs, checks the schema marker when one
 * is present, and reports a path nothing answers as {@link MarketError} with
 * code `unavailable` — a state callers hide the control for rather than show
 * as a failure.
 *
 * Requests are same-origin: the browser half fetches the host that served it,
 * which is the origin the market's own fence admits. Nothing here carries a
 * credential, port, or host name of its own.
 *
 * @module @elves-ai/dsh-plugin-updater/client/market
 */
/** Path prefix of the market's versioned update API. */
export declare const MARKET_API_BASE = "/dsh-market/api/v1";
/** The marker every answer of this API carries. */
export declare const UPDATE_API_SCHEMA = "dsh-market/update-api/v1";
/** Why a market request produced no usable answer. */
export type MarketFailureCode = 
/** Nothing answers this path: no market is installed, or it predates the API. */
'unavailable'
/** The request never reached the host. */
 | 'unreachable'
/** The market answered an error body. */
 | 'refused'
/** The market answered something that is not this API's JSON. */
 | 'unreadable'
/** An operation was accepted but did not reach a terminal state in time. */
 | 'timeout';
/** A market request that produced no usable answer. */
export declare class MarketError extends Error {
    readonly code: MarketFailureCode;
    /** The market's own machine code, when its answer carried one. */
    readonly marketCode?: string | undefined;
    constructor(code: MarketFailureCode, message: string, 
    /** The market's own machine code, when its answer carried one. */
    marketCode?: string | undefined);
}
/** What this control needs to know about the market in front of it. */
export interface MarketCapabilities {
    /** Market version, for diagnostics. */
    marketVersion: string;
    /** Profile the market manages, for diagnostics. */
    profile: string;
    /** Whether the market can start an update. */
    canUpdate: boolean;
    /** Whether the market restarts the host itself; false means the user restarts it. */
    restartSupported: boolean;
}
/** One installed package as the market's update check reports it. */
export interface PackageUpdateStatus {
    /** Package name the market checked. */
    name: string;
    /** Where the package came from: `npm`, `github`, a path, … */
    source: string;
    /** Version on disk; a git package reports the resolved commit. */
    installedVersion?: string;
    /** Version the market would install. */
    latestVersion?: string;
    /** Whether {@link PackageUpdateStatus.latestVersion} differs from the installed one. */
    updateAvailable: boolean;
}
/** Every state an update operation can report. */
export type UpdateOperationState = 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled' | 'rolled-back';
/** States an operation never leaves. */
export declare const TERMINAL_OPERATION_STATES: readonly UpdateOperationState[];
/** Why an update stopped. */
export interface UpdateFailure {
    /** Stable machine code (`RELEASE_TOO_FRESH`, `RESOLVED_VERSION_MISMATCH`, …). */
    code: string;
    /** Bounded user-facing sentence. */
    message: string;
    /** Whether retrying unchanged can succeed. */
    retryable: boolean;
}
/** One update the market is running or has finished. */
export interface UpdateOperation {
    /** Id to poll with. */
    operationId: string;
    /** Package the operation is updating. */
    packageName: string;
    /** Where the operation stands. */
    state: UpdateOperationState;
    /** Version on disk before the operation. */
    beforeVersion?: string;
    /** Version on disk once it finished. */
    installedVersion?: string;
    /** Package-manager progress, 0-100, when it reports any. */
    percent: number | null;
    /** What the package manager is doing, when it says. */
    detail: string | null;
    /** Whether the new code is on disk but the running process still holds the old one. */
    restartRequired: boolean;
    /** Present once the operation failed. */
    failure?: UpdateFailure;
}
/** The market's update API, narrowed to what this plugin asks of it. */
export interface MarketClient {
    /**
     * Read what the market in front of this client supports.
     * @param signal - cancellation for this request.
     * @returns the capability subset this control branches on.
     */
    capabilities(signal?: AbortSignal): Promise<MarketCapabilities>;
    /**
     * Ask whether one installed package has an update.
     * @param name - installed package name.
     * @param options - `force` bypasses the market's short check cache.
     * @returns the installed and target versions.
     */
    check(name: string, options?: {
        force?: boolean;
        signal?: AbortSignal;
    }): Promise<PackageUpdateStatus>;
    /**
     * Start an update.
     * @param name - installed package name.
     * @param options - `force` opts this operation out of the registry release-age wait.
     * @returns the operation id to poll.
     */
    start(name: string, options?: {
        force?: boolean;
        signal?: AbortSignal;
    }): Promise<string>;
    /**
     * Read one operation.
     * @param operationId - id the market returned from {@link MarketClient.start}.
     * @param signal - cancellation for this request.
     * @returns the operation's current record.
     */
    operation(operationId: string, signal?: AbortSignal): Promise<UpdateOperation>;
}
/** Transport seam for tests and for deployments behind a different origin. */
export interface MarketClientOptions {
    /** Transport override; defaults to the global `fetch`. */
    fetchImpl?: typeof fetch;
    /** API prefix override; defaults to {@link MARKET_API_BASE}. */
    base?: string;
}
/**
 * Build the market client.
 * @param options - transport and API-prefix seams.
 * @returns a client whose failures are {@link MarketError}.
 */
export declare function createMarketClient(options?: MarketClientOptions): MarketClient;
/** How long to wait between two reads of one operation. */
export declare const DEFAULT_OPERATION_POLL_MS = 1000;
/** How long one accepted operation may run before this client stops waiting. */
export declare const DEFAULT_OPERATION_TIMEOUT_MS: number;
/** Options for {@link watchOperation}. */
export interface WatchOperationOptions {
    /** Cancellation: aborts the running read and the wait between reads. */
    signal?: AbortSignal;
    /** Milliseconds between reads. */
    intervalMs?: number;
    /** Milliseconds one operation may take before this call gives up. */
    timeoutMs?: number;
    /** Called with every record read, including the terminal one. */
    onProgress?: (operation: UpdateOperation) => void;
    /** Sleep seam for tests. */
    sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
    /** Clock seam for tests. */
    now?: () => number;
}
/**
 * Follow one accepted operation to its terminal state.
 *
 * @param client - the market client that accepted it.
 * @param operationId - id the market returned.
 * @param options - polling cadence, deadline, cancellation, and progress sink.
 * @returns the operation record in a terminal state.
 */
export declare function watchOperation(client: MarketClient, operationId: string, options?: WatchOperationOptions): Promise<UpdateOperation>;
/**
 * A version as a person reads it: a resolved commit shortened, a release kept whole.
 * @param version - the market's version string.
 * @returns the display form.
 */
export declare function shortVersion(version: string): string;
