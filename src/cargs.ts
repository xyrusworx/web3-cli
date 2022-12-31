import process from "process";
import {CommandOutput} from "./cmd";

export class AppArguments {

    constructor(private _args: string[]) {
        let stopParsing = false;
        let cmd = [];

        const start =
            !!this._args[0].match(/ts-node[\\\/]dist[\\\/]bin\.js/) ||
            !!this._args[0].match(/node(\.exe)$/)
                ? 2
                : 1;
        for(let i = start; i < this._args.length; i++) {

            if (!stopParsing)
                switch (this._args[i]) {
                    case "-h":
                    case "-?":
                    case "--help":
                        AppArguments.printHelp(console);
                        process.exit(0);
                        continue;
                    case "--nologo":
                        this.noLogo = true;
                        continue;
                    case "-v":
                    case "--verbose":
                        this.verbose = true;
                        this.quiet = false;
                        continue;
                    case "-q":
                    case "--quiet":
                        this.verbose = false;
                        this.quiet = true;
                        continue;
                    case "--":
                        stopParsing = true;
                        continue;
                }

            cmd.push(this._args[i]);
        }

        if (cmd.length <= 0) {
            throw "Missing command";
        }

        this.command = cmd[0];
        this.commandArgs = cmd.slice(1);
    }

    public static printHelp(output: CommandOutput) {
        output.log("Usage: web3 [options] <command> {command-options}");
        output.log("Available options:");
        output.log("  --help / -h / -?       Shows this help screen");
        output.log("  --nologo               Suppresses the display of application name and version");
        output.log("  --verbose / -v         Shows additional, diagnostic output");
        output.log("  --quiet / -q           Suppresses all output (implies --nologo)");
        output.log("");
    }

    public readonly noLogo: boolean = false;
    public readonly verbose: boolean = false;
    public readonly quiet: boolean = false;

    public readonly command: string;
    public readonly commandArgs: string[] = [];
}
