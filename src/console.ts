import chalk from "chalk";
import {CommandOutput} from "./cmd";

export class WrappedConsoleLog implements CommandOutput{

    constructor(
        private _quiet: boolean,
        private _verbose: boolean) {
    }

    public debug(...args: any[]): void {
        if (!this._verbose || this._quiet) return;
        this.write([...args], "debug");
    }
    public info(...args: any[]): void {
        if (this._quiet) return;
        this.write([...args], "info");
    }
    public warn(...args: any[]): void {
        if (this._quiet) return;
        this.write([...args], "warn");
    }
    public error(...args: any[]): void {
        if (this._quiet) return;
        this.write([...args], "error");
    }
    public log(...args: any | any[]): void {
        if (this._quiet) return;
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

        func.apply(this, message.map(x => typeof x === "string" ? color(x) : x));
    }
}
