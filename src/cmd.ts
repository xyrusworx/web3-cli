import fs from "fs";
import path from "path";

export interface Command {
    run(args: string[]): Promise<number>;
}

export interface CommandOutput {
    debug(...args: any[]): void;
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
    log(...args: any[]): void;
}

export function createCommand(name: string, output: CommandOutput) {

    if (!`${name}`.match(/^[a-zA-Z0-9]+$/)) {
        throw `Invalid command: ${name}`;
    }

    const base = path.join(__dirname, "commands", name.toLowerCase());

    if (!fs.existsSync(base + ".ts") && !fs.existsSync(base + ".js")) {
        throw `Unknown command: ${name}`;
    }

    try {
        const cmdClass = require(base).default;
        return new cmdClass(output);
    }
    catch (e) {
        throw `Error initializing command ${name}: ${e?.message || e}`;
    }
}
