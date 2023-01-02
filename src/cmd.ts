import fs from "fs";
import path from "path";

export interface Command {
    run(args: string[]): Promise<number>;
}

export interface CommandInput {
    readonly quiet: boolean;
    readonly verbose: boolean;

    readonly command: string;
    readonly commandArgs: string[];
}

export interface CommandOutput {
    debug(...args: any[]): void;
    info(...args: any[]): void;
    warn(...args: any[]): void;
    error(...args: any[]): void;
    log(...args: any[]): void;
}

export function createCommand(input: CommandInput, output: CommandOutput) {

    if (!`${input.command}`.match(/^[a-zA-Z0-9]+$/)) {
        throw `Invalid command: ${input.command}`;
    }

    const base = path.join(__dirname, "commands", input.command.toLowerCase());

    if (!fs.existsSync(base + ".ts") && !fs.existsSync(base + ".js")) {
        throw `Unknown command: ${input.command}`;
    }

    try {
        const cmdClass = require(base).default;
        return new cmdClass(input, output);
    }
    catch (e) {
        throw `Error initializing command ${input.command}: ${e?.message || e}`;
    }
}
