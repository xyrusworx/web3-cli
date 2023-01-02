import chalk from "chalk";
import {CommandOutput} from "./cmd";

export class WrappedConsoleLog implements CommandOutput {

    constructor(
        private _quiet: boolean,
        private _verbose: boolean) {
    }

    public debug(...args: any[]): void {
        if (!this._verbose) return;
        this.write([...args], "debug");
    }
    public info(...args: any[]): void {
        this.write([...args], "info");
    }
    public warn(...args: any[]): void {
        this.write([...args], "warn");
    }
    public error(...args: any[]): void {
        this.write([...args], "error");
    }
    public log(...args: any | any[]): void {
        this.write([...args], "info");
    }

    private write(message: any | any[], status: string): void {

        if (!status) status = "info";
        if (!Array.isArray(message)) {
            message = [message];
        }

        let func, color;

        switch(status) {
            case "error":
                func = console.error;
                color = chalk.redBright;
                break;
            case "warn":
                func = console.warn;
                color = chalk.yellowBright;
                break;
            case "debug":
                func = console.debug;
                color = chalk.dim;
                break;
            default:
                func = console.log;
                color = chalk.reset;
                break;
        }

        if (this._quiet) {
            if (status === "error") {
                process.stderr.write(message.join(" "), "utf-8");
            }
            return;
        }

        func.apply(this, message.map(x => typeof x === "string" ? color(x) : x));
    }
}

export async function readAllStdin(stream) {
    return await new Promise<string>(resolve => {
        const chunks = [];
        stream.on("data", chunk => chunks.push(chunk));
        stream.on("end", () => {
            resolve(Buffer.concat(chunks).toString('utf8').trim());
        });
    });
}
