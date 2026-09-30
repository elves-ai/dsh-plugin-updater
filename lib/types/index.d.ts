/**
 * Host half of the plugin update control.
 *
 * Checking and applying an update belongs to the plugin market and to the
 * profile's own package manager. This plugin spawns nothing, runs no package
 * manager, and holds no host state: the browser half asks the market's
 * same-origin update API directly. This entry exists so the profile row has a
 * plugin to load and so the package ships a browser half at all.
 *
 * @module @elves-ai/dsh-plugin-updater
 */
/** Plugin name the Loader reports in diagnostics. */
export declare const name = "plugin-updater";
/** No host services, routes, or tools are registered. */
export declare function apply(): void;
